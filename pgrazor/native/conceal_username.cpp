#include "conceal_username.h"
#include "hook_engine.h"
#include "runtime_bootstrap.h"
#include "runtime_metadata.h"
#include "runtime_transport.h"
#include "shared_metadata.h"
#include <atomic>
#include <cstring>
#include <dlfcn.h>
#include <string>
#include <time.h>
#include <unistd.h>
#include <vector>

namespace {
using namespace pgr_shared_meta;
using namespace pgr_conceal_username;

struct Failure { const char *where; };
void require(bool ok, const char *where) { if (!ok) throw Failure{where}; }
template<class F> F fn(const void *p) { require(p, "missing runtime export"); return reinterpret_cast<F>(const_cast<void*>(p)); }

PgrBootBinding boot{};
const PgrSharedMetadataOutput *md = nullptr;
bool initialized = false, busy = false, faulted = false, hooks_tried = false;
std::atomic<bool> active{false};
std::atomic<uint64_t> owner{0};
uint64_t next_name_poll = 0;
constexpr uint64_t kNamePollMs = 5000;
constexpr int kMaxLiveTexts = 2048;

void *string_class = nullptr;
uintptr_t replacement_handle = 0;
// Unity owner thread only: active real trainer name in UTF-16.
std::vector<uint16_t> real_name;

void *exp(const char *name) {
  std::string n = "il2cpp_"; n += name;
  void *p = dlsym(boot.handle, n.c_str());
  require(p, name);
  return p;
}

uintptr_t (*il2cpp_array_length)(void*) = nullptr;
int (*il2cpp_string_length)(void*) = nullptr;
void *(*il2cpp_type_get_object)(void*) = nullptr;
int (*il2cpp_type_get_type)(const void*) = nullptr;
void *(*il2cpp_class_get_methods)(const void*, void**) = nullptr;
const char *(*il2cpp_method_get_name)(void*) = nullptr;
const void *(*il2cpp_method_get_param)(void*, unsigned) = nullptr;
unsigned (*il2cpp_method_get_param_count)(void*) = nullptr;
bool (*il2cpp_method_is_generic)(void*) = nullptr;
bool (*il2cpp_class_is_enum)(void*) = nullptr;
bool (*il2cpp_class_is_valuetype)(void*) = nullptr;
bool (*il2cpp_type_is_byref)(const void*) = nullptr;

struct Root {
  uintptr_t h = 0;
  Root() = default;
  explicit Root(void *v) {
    if (v) { h = fn<uintptr_t(*)(void*, int)>(boot.runtime.gchandle_new)(v, 0); require(h, "GC root"); }
  }
  Root(const Root&) = delete; Root& operator=(const Root&) = delete;
  ~Root() { reset(); }
  void reset() { if (h) { fn<void(*)(uintptr_t)>(boot.runtime.gchandle_free)(h); h = 0; } }
  void *get() const { return h ? fn<void*(*)(uintptr_t)>(boot.runtime.gchandle_get_target)(h) : nullptr; }
  explicit operator bool() const { return get() != nullptr; }
};

void *klass(void *o) { require(o, "null object"); return fn<void*(*)(void*)>(boot.runtime.object_get_class)(o); }

std::string typename_of(const void *type) {
  char *p = fn<char*(*)(const void*)>(boot.meta.type_get_name)(type);
  require(p, "type name");
  std::string s = p;
  fn<void(*)(void*)>(boot.meta.mem_free)(p);
  return s;
}

const void *opt_cls(const char *ns, const char *name) {
  const auto *api = static_cast<const PgrMetaApi*>(pgrazor_runtime_metadata_api(1));
  if (!api || !api->resolve_class) return nullptr;
  PgrMetaClassQuery q{}; q.version = 1; q.size = sizeof(q);
  q.name_space = ns; q.name = name; q.canonical_match = PGR_MD_MATCH_EXACT;
  PgrMetaClassResult out{};
  return api->resolve_class(&q, &out) == 0 ? out.klass : nullptr;
}

void *cls(const char *ns, const char *name) {
  const void *k = opt_cls(ns, name);
  require(k != nullptr, name);
  return const_cast<void*>(k);
}

void *invoke(void *m, void *o, void **args = nullptr) {
  void *ex = nullptr;
  void *v = fn<void*(*)(void*, void*, void**, void**)>(boot.runtime.runtime_invoke)(m, o, args, &ex);
  require(!ex, "managed call failed");
  return v;
}

template<class T> T unbox(void *o) {
  require(o, "null result");
  T v{}; auto p = fn<void*(*)(void*)>(boot.runtime.object_unbox)(o);
  require(p, "boxed value"); std::memcpy(&v, p, sizeof(v)); return v;
}

void *h(unsigned id) { return md ? const_cast<void*>(md->opt_handles[id]) : nullptr; }

Root type_object(const void *k) {
  return Root(il2cpp_type_get_object(fn<void*(*)(const void*)>(boot.meta.class_get_type)(k)));
}

const PgrRuntimeTransportApi *transport() {
  return static_cast<const PgrRuntimeTransportApi*>(pgrazor_runtime_transport_api(1));
}

void event(const std::string &message) {
  auto tr = transport();
  if (!tr) return;
  PgrRuntimeTransportString s[] = {{"conceal-username", 16}, {message.c_str(), uint32_t(message.size())}};
  tr->emit(19, nullptr, 0, s, 2);
}

Config configured() {
  auto tr = transport();
  PgrRuntimeTransportSample a{};
  char s[16]{};
  uint32_t n = 0;
  if (!tr || tr->sample(&a) || !a.snapshot_fresh || a.fault ||
      tr->get_string(27, s, sizeof(s) - 1, &n) || n >= sizeof(s)) {
    return {};
  }
  s[n] = 0;
  return parse(s);
}

bool register_sized(const void *type) {
  const int kind = il2cpp_type_get_type(type);
  if (il2cpp_type_is_byref(type)) return true;
  if ((kind >= 0x02 && kind <= 0x0b) || kind == 0x0e || kind == 0x12 || kind == 0x14 ||
      kind == 0x18 || kind == 0x19 || kind == 0x1c || kind == 0x1d) {
    return true;
  }
  void *k = fn<void*(*)(const void*)>(boot.meta.class_from_type)(type);
  if (!k) return false;
  if (kind == 0x11) return il2cpp_class_is_enum(k);
  if (kind == 0x15) return !il2cpp_class_is_valuetype(k);
  return false;
}

void *find_overload(const void *k, const char *name, const char *p0, const char *p1 = nullptr) {
  if (!k) return nullptr;
  const unsigned count = p1 ? 2u : 1u;
  void *iter = nullptr;
  while (void *m = il2cpp_class_get_methods(k, &iter)) {
    const char *mname = il2cpp_method_get_name(m);
    if (!mname || std::strcmp(mname, name) != 0) continue;
    if (il2cpp_method_is_generic(m) || il2cpp_method_get_param_count(m) != count) continue;
    uint32_t iflags = 0;
    if (fn<uint32_t(*)(void*, uint32_t*)>(boot.meta.method_get_flags)(m, &iflags) & 0x0010u) continue;
    if (typename_of(il2cpp_method_get_param(m, 0)) != p0) continue;
    if (p1 && typename_of(il2cpp_method_get_param(m, 1)) != p1) continue;
    return m;
  }
  return nullptr;
}

void *find_speech_method(const void *k) {
  if (!k) return nullptr;
  void *iter = nullptr;
  while (void *m = il2cpp_class_get_methods(k, &iter)) {
    const char *mname = il2cpp_method_get_name(m);
    if (!mname || std::strcmp(mname, "SetSpeechText") != 0) continue;
    if (il2cpp_method_is_generic(m) || il2cpp_method_get_param_count(m) != 3u) continue;
    uint32_t iflags = 0;
    if (fn<uint32_t(*)(void*, uint32_t*)>(boot.meta.method_get_flags)(m, &iflags) & 0x0010u) continue;
    if (typename_of(il2cpp_method_get_param(m, 0)) != "System.String") continue;
    if (!register_sized(il2cpp_method_get_param(m, 1)) ||
        !register_sized(il2cpp_method_get_param(m, 2))) continue;
    return m;
  }
  return nullptr;
}

void *replacement_string() {
  if (replacement_handle) {
    void *existing = fn<void*(*)(uintptr_t)>(boot.runtime.gchandle_get_target)(replacement_handle);
    if (existing) return existing;
    fn<void(*)(uintptr_t)>(boot.runtime.gchandle_free)(replacement_handle);
    replacement_handle = 0;
  }
  void *s = fn<void*(*)(const char*)>(boot.runtime.string_new)(kReplacement);
  if (s) replacement_handle = fn<uintptr_t(*)(void*, int)>(boot.runtime.gchandle_new)(s, 0);
  return s;
}

void *maybe_mask(void *str) {
  if (!active.load(std::memory_order_acquire) || !str) return str;
  if (uint64_t(gettid()) != owner.load(std::memory_order_relaxed)) return str;
  if (real_name.size() < 2) return str;
  if (!string_class || fn<void*(*)(void*)>(boot.runtime.object_get_class)(str) != string_class) return str;

  thread_local bool in_mask = false;
  if (in_mask) return str;
  struct Reentry { bool &flag; Reentry(bool &f) : flag(f) { flag = true; } ~Reentry() { flag = false; } } guard(in_mask);

  const int32_t len = il2cpp_string_length(str);
  if (len <= 0 || len < int32_t(real_name.size())) return str;
  const auto *chars = static_cast<const uint16_t*>(fn<void*(*)(void*)>(boot.runtime.string_chars)(str));
  if (!chars) return str;

  std::u16string out;
  bool exact = false;
  if (!replace_username_utf16(chars, len, real_name.data(), int32_t(real_name.size()), out, exact)) {
    return str;
  }
  if (exact) {
    void *rep = replacement_string();
    return rep ? rep : str;
  }
  std::string utf8 = utf16_to_utf8(out.data(), out.size());
  void *built = fn<void*(*)(const char*)>(boot.runtime.string_new)(utf8.c_str());
  return built ? built : str;
}

constexpr size_t kMaxText1Hooks = 8;
constexpr size_t kMaxText2BoolHooks = 2;
std::atomic<void*> orig_text1[kMaxText1Hooks]{};
std::atomic<void*> orig_text2_bool[kMaxText2BoolHooks]{};
std::atomic<void*> orig_speech3{nullptr};
std::vector<void*> hooked_codes;

template<size_t I>
void hook_text1(void *self, void *str, const void *method) {
  void *masked = maybe_mask(str);
  auto orig = reinterpret_cast<void(*)(void*, void*, const void*)>(orig_text1[I].load(std::memory_order_acquire));
  if (orig) orig(self, masked, method);
}

template<size_t I>
void hook_text2_bool(void *self, void *str, uint8_t sync, const void *method) {
  void *masked = maybe_mask(str);
  auto orig = reinterpret_cast<void(*)(void*, void*, uint8_t, const void*)>(orig_text2_bool[I].load(std::memory_order_acquire));
  if (orig) orig(self, masked, sync, method);
}

void hook_speech3(void *self, void *str, void *arg1, void *arg2, const void *method) {
  void *masked = maybe_mask(str);
  auto orig = reinterpret_cast<void(*)(void*, void*, void*, void*, const void*)>(orig_speech3.load(std::memory_order_acquire));
  if (orig) orig(self, masked, arg1, arg2, method);
}

void *(*const kText1Wrappers[kMaxText1Hooks])() = {
  reinterpret_cast<void*(*)()>(hook_text1<0>), reinterpret_cast<void*(*)()>(hook_text1<1>),
  reinterpret_cast<void*(*)()>(hook_text1<2>), reinterpret_cast<void*(*)()>(hook_text1<3>),
  reinterpret_cast<void*(*)()>(hook_text1<4>), reinterpret_cast<void*(*)()>(hook_text1<5>),
  reinterpret_cast<void*(*)()>(hook_text1<6>), reinterpret_cast<void*(*)()>(hook_text1<7>),
};

void *(*const kText2BoolWrappers[kMaxText2BoolHooks])() = {
  reinterpret_cast<void*(*)()>(hook_text2_bool<0>),
  reinterpret_cast<void*(*)()>(hook_text2_bool<1>),
};

size_t text1_count = 0, text2_bool_count = 0;

bool already_hooked(void *code) {
  for (void *c : hooked_codes) if (c == code) return true;
  return false;
}

bool valid_method_code(const PgrMetaApi *api, void *m, void *&code_out) {
  if (!m) return false;
  code_out = nullptr;
  std::memcpy(&code_out, m, sizeof(void*));
  if (!code_out || already_hooked(code_out)) return false;
  PgrMetaCodeQuery cq{1, sizeof(cq), code_out, 16, nullptr, 0, 0};
  return api->validate_code(&cq) == 0;
}

int install_hooks() {
  hooks_tried = true;
  const auto *api = static_cast<const PgrMetaApi*>(pgrazor_runtime_metadata_api(1));
  if (!api || !api->validate_code) return 0;

  int count = 0;
  auto attach_text1 = [&](const void *owner_cls, const char *name) {
    if (text1_count >= kMaxText1Hooks) return;
    void *m = find_overload(owner_cls, name, "System.String");
    void *code = nullptr;
    if (!valid_method_code(api, m, code)) return;
    void *orig = nullptr;
    if (pgrazor_hook(code, reinterpret_cast<void*>(kText1Wrappers[text1_count]), &orig) == 0 && orig) {
      orig_text1[text1_count].store(orig, std::memory_order_release);
      hooked_codes.push_back(code);
      ++text1_count;
      ++count;
    }
  };

  auto attach_text2_bool = [&](const void *owner_cls, const char *name) {
    if (text2_bool_count >= kMaxText2BoolHooks) return;
    void *m = find_overload(owner_cls, name, "System.String", "System.Boolean");
    void *code = nullptr;
    if (!valid_method_code(api, m, code)) return;
    void *orig = nullptr;
    if (pgrazor_hook(code, reinterpret_cast<void*>(kText2BoolWrappers[text2_bool_count]), &orig) == 0 && orig) {
      orig_text2_bool[text2_bool_count].store(orig, std::memory_order_release);
      hooked_codes.push_back(code);
      ++text2_bool_count;
      ++count;
    }
  };

  if (const void *tmp = opt_cls("TMPro", "TMP_Text")) {
    attach_text1(tmp, "set_text");
    attach_text1(tmp, "SetText");
    attach_text2_bool(tmp, "SetText");
  }
  if (const void *ugui = opt_cls("TMPro", "TextMeshProUGUI")) {
    attach_text1(ugui, "set_text");
  }
  if (const void *tmp3d = opt_cls("TMPro", "TextMeshPro")) {
    attach_text1(tmp3d, "set_text");
  }
  if (const void *uitext = opt_cls("UnityEngine.UI", "Text")) {
    attach_text1(uitext, "set_text");
  }
  if (const void *convo = opt_cls("Niantic.Holoholo.UI.Conversations", "ConversationLayoutGui")) {
    void *m = find_speech_method(convo);
    void *code = nullptr;
    if (valid_method_code(api, m, code)) {
      void *orig = nullptr;
      if (pgrazor_hook(code, reinterpret_cast<void*>(hook_speech3), &orig) == 0 && orig) {
        orig_speech3.store(orig, std::memory_order_release);
        hooked_codes.push_back(code);
        ++count;
      }
    }
  }
  return count;
}

bool refresh_player_name(bool &changed) {
  changed = false;
  if (!md || !h(H_IL_MAP) || !h(H_IL_FIND_M) || !h(H_IL_CONTAINER_M) || !h(H_IL_RESOLVE_M)) return false;
  const void *player_contract = opt_cls("Niantic.Holoholo", "IPlayerService");
  if (!player_contract) return false;

  Root map_type = type_object(h(H_IL_MAP));
  void *map_args[] = {map_type.get()};
  Root map(invoke(h(H_IL_FIND_M), nullptr, map_args));
  if (!map) return false;
  Root container(invoke(h(H_IL_CONTAINER_M), map.get()));
  if (!container) return false;
  Root svc_type = type_object(player_contract);
  void *resolve_args[] = {svc_type.get()};
  Root svc(invoke(h(H_IL_RESOLVE_M), container.get(), resolve_args));
  if (!svc) return false;

  void *getter = fn<void*(*)(void*, const char*, int)>(boot.meta.class_get_method_from_name)(klass(svc.get()), "get_PlayerName", 0);
  if (!getter) return false;
  void *ex = nullptr;
  void *str = fn<void*(*)(void*, void*, void**, void**)>(boot.runtime.runtime_invoke)(getter, svc.get(), nullptr, &ex);
  if (ex || !str || fn<void*(*)(void*)>(boot.runtime.object_get_class)(str) != string_class) return false;

  const int32_t len = il2cpp_string_length(str);
  if (len < 2 || len > 128) return false;
  const auto *chars = static_cast<const uint16_t*>(fn<void*(*)(void*)>(boot.runtime.string_chars)(str));
  if (!chars) return false;

  if (real_name.size() == size_t(len) &&
      std::memcmp(real_name.data(), chars, size_t(len) * sizeof(uint16_t)) == 0) {
    return true;
  }
  real_name.assign(chars, chars + len);
  changed = true;
  return true;
}

void mask_live_texts() {
  if (!active.load(std::memory_order_acquire) || real_name.size() < 2) return;
  const void *obj_cls = opt_cls("UnityEngine", "Object");
  if (!obj_cls) return;
  void *find_m = fn<void*(*)(const void*, const char*, int)>(boot.meta.class_get_method_from_name)(obj_cls, "FindObjectsOfType", 1);
  void *alive_m = fn<void*(*)(const void*, const char*, int)>(boot.meta.class_get_method_from_name)(obj_cls, "op_Implicit", 1);
  if (!find_m || !alive_m) return;

  auto sweep_type = [&](const char *ns, const char *name) {
    const void *k = opt_cls(ns, name);
    if (!k) return;
    void *get_m = fn<void*(*)(const void*, const char*, int)>(boot.meta.class_get_method_from_name)(k, "get_text", 0);
    void *set_m = find_overload(k, "set_text", "System.String");
    if (!get_m || !set_m) return;

    Root t = type_object(k);
    void *fargs[] = {t.get()};
    void *ex = nullptr;
    Root arr(fn<void*(*)(void*, void*, void**, void**)>(boot.runtime.runtime_invoke)(find_m, nullptr, fargs, &ex));
    if (ex || !arr) return;
    const uintptr_t count = il2cpp_array_length(arr.get());
    const uintptr_t cap = count < kMaxLiveTexts ? count : kMaxLiveTexts;
    for (uintptr_t i = 0; i < cap; ++i) {
      void *item = nullptr;
      std::memcpy(&item, static_cast<char*>(arr.get()) + 0x20 + i * sizeof(void*), sizeof(void*));
      if (!item) continue;
      void *a_args[] = {item};
      ex = nullptr;
      void *boxed = fn<void*(*)(void*, void*, void**, void**)>(boot.runtime.runtime_invoke)(alive_m, nullptr, a_args, &ex);
      if (ex || !boxed || !unbox<uint8_t>(boxed)) continue;
      ex = nullptr;
      void *cur = fn<void*(*)(void*, void*, void**, void**)>(boot.runtime.runtime_invoke)(get_m, item, nullptr, &ex);
      if (ex || !cur) continue;
      void *masked = maybe_mask(cur);
      if (masked != cur) {
        void *s_args[] = {masked};
        ex = nullptr;
        fn<void*(*)(void*, void*, void**, void**)>(boot.runtime.runtime_invoke)(set_m, item, s_args, &ex);
      }
    }
  };

  sweep_type("TMPro", "TMP_Text");
  sweep_type("UnityEngine.UI", "Text");
}

uint64_t clock_ms() {
  timespec t{};
  clock_gettime(CLOCK_BOOTTIME, &t);
  return uint64_t(t.tv_sec) * 1000 + t.tv_nsec / 1000000;
}

void bind_exports() {
  il2cpp_array_length = reinterpret_cast<decltype(il2cpp_array_length)>(exp("array_length"));
  il2cpp_string_length = reinterpret_cast<decltype(il2cpp_string_length)>(exp("string_length"));
  il2cpp_type_get_object = reinterpret_cast<decltype(il2cpp_type_get_object)>(exp("type_get_object"));
  il2cpp_type_get_type = reinterpret_cast<decltype(il2cpp_type_get_type)>(exp("type_get_type"));
  il2cpp_class_get_methods = reinterpret_cast<decltype(il2cpp_class_get_methods)>(exp("class_get_methods"));
  il2cpp_method_get_name = reinterpret_cast<decltype(il2cpp_method_get_name)>(exp("method_get_name"));
  il2cpp_method_get_param = reinterpret_cast<decltype(il2cpp_method_get_param)>(exp("method_get_param"));
  il2cpp_method_get_param_count = reinterpret_cast<decltype(il2cpp_method_get_param_count)>(exp("method_get_param_count"));
  il2cpp_method_is_generic = reinterpret_cast<decltype(il2cpp_method_is_generic)>(exp("method_is_generic"));
  il2cpp_class_is_enum = reinterpret_cast<decltype(il2cpp_class_is_enum)>(exp("class_is_enum"));
  il2cpp_class_is_valuetype = reinterpret_cast<decltype(il2cpp_class_is_valuetype)>(exp("class_is_valuetype"));
  il2cpp_type_is_byref = reinterpret_cast<decltype(il2cpp_type_is_byref)>(exp("type_is_byref"));
  string_class = cls("System", "String");
}

}  // namespace

void pgr_conceal_username_tick(uint64_t tid, const PgrSharedMetadataOutput *metadata) {
  if (busy || faulted || !tid || tid != uint64_t(gettid())) return;
  const uint64_t cur_owner = owner.load(std::memory_order_relaxed);
  if (cur_owner && cur_owner != tid) return;
  struct Guard { Guard() { busy = true; } ~Guard() { busy = false; } } guard;

  md = metadata;
  const Config c = configured();
  const bool was_active = active.load(std::memory_order_acquire);
  if (!c.enabled) {
    if (was_active) {
      active.store(false, std::memory_order_release);
      event("Conceal username OFF");
    }
    return;
  }

  try {
    if (!initialized) {
      const auto *api = static_cast<const PgrBootApi*>(pgrazor_runtime_bootstrap_api(1));
      boot.version = 1; boot.size = sizeof(boot);
      if (!api || api->snapshot(&boot) != 0) return;
      bind_exports();
      owner.store(tid, std::memory_order_release);
      initialized = true;
    }
    require(fn<void*(*)()>(boot.runtime.thread_current)() != nullptr, "owner thread not attached");

    if (!hooks_tried) {
      const int hooked = install_hooks();
      if (hooked <= 0) {
        faulted = true;
        active.store(false, std::memory_order_release);
        event("Conceal username unsupported: no text setter hooks available");
        return;
      }
      event("Conceal username hooks installed (" + std::to_string(hooked) + ")");
    }

    const bool turned_on = !was_active;
    active.store(true, std::memory_order_release);

    const uint64_t now = clock_ms();
    bool name_changed = false;
    if (turned_on || real_name.empty() || now >= next_name_poll) {
      next_name_poll = now + kNamePollMs;
      refresh_player_name(name_changed);
    }
    if ((turned_on || name_changed) && real_name.size() >= 2) {
      mask_live_texts();
    }
  } catch (const Failure &f) {
    faulted = true;
    active.store(false, std::memory_order_release);
    event(std::string("Conceal username stopped: ") + f.where);
  } catch (...) {
    faulted = true;
    active.store(false, std::memory_order_release);
    event("Conceal username stopped after an unexpected error");
  }
}

void pgr_conceal_username_stop(uint64_t tid) {
  active.store(false, std::memory_order_release);
  const uint64_t cur_owner = owner.load(std::memory_order_relaxed);
  if (!initialized || tid != cur_owner || tid != uint64_t(gettid())) return;
  real_name.clear();
  if (replacement_handle) {
    fn<void(*)(uintptr_t)>(boot.runtime.gchandle_free)(replacement_handle);
    replacement_handle = 0;
  }
}
