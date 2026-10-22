// Supported ARM64 build only. Loading defines the API without native work.
// During a validated manual summary dismissal, capture the matching details
// arguments without creating the panel. The caller runs existing transfer checks
// and invokes the game's supplied dismissal Action after the summary returns.
// The native replacement never calls JavaScript; unmatched calls pass through.
// end() transfers GC-handle ownership to the caller. Retain native state after
// revert so any native frames still unwinding cannot access freed memory.

(function (root) {

'use strict';

// Retained past dispose()/revert so an in-flight native call never touches freed
// memory. Also a hard cap on bridge instances to bound retained native state.
const retained = [];
const SESSION_LIMIT = 16;

// Fixed native state layout. Offsets below MUST match the State struct in SOURCE.
// u32 scalars first, pointer-aligned block after an explicit pad.
const OFF = Object.freeze({
  enabled: 0x00, captured: 0x04, tid: 0x08, confirm: 0x0c, persist: 0x10,
  openHyperTraining: 0x14, hideAr: 0x18, post: 0x1c, suppress: 0x20, /* pad 0x24 */
  response: 0x28, service: 0x30, pk: 0x38, callback: 0x40,
  clsView: 0x48, clsAction: 0x50, clsPokemon: 0x58
});
const STATE_SIZE = 0x60;

// Field offsets in SOURCE are validated by quick-close.js before installation.
// ShowPokemonInfo(instance, PokemonProto pk, bool confirm, bool persist,
//   int openHyperTraining, Action dismissed, Action displayed,
//   Action<Params> dismissedParams, bool hideAr, bool post, bool suppress, MethodInfo).
// ARM64 AAPCS64: x0..x7 hold instance,pk,confirm,persist,openHyperTraining,dismissed,
// displayed,dismissedParams; hideAr,post,suppress,MethodInfo spill to 8-byte stack
// slots (C.16 rounds sub-word stack args up to 8 bytes). Bools arrive with the value
// in the low byte and unspecified upper bits, so every bool is compared/stored masked
// (& 0xff) and forwarded as the full unchanged register/slot.
const SOURCE = `
#define FWD orig(inst, pk, confirm, persist, open_ht, dismissed, displayed, dismissed_params, hide_ar, post, suppress, mi)

typedef struct {
  volatile unsigned int enabled;
  volatile unsigned int captured;
  volatile int tid;
  volatile unsigned int confirm;
  volatile unsigned int persist;
  volatile int open_ht;
  volatile unsigned int hide_ar;
  volatile unsigned int post;
  volatile unsigned int suppress;
  volatile unsigned int pad;
  void * volatile response;
  void * volatile service_handle;
  void * volatile pk_handle;
  void * volatile callback_handle;
  void *cls_view;
  void *cls_action;
  void *cls_pokemon;
} State;

typedef void (*ShowFn)(void *, void *, unsigned long, unsigned long, unsigned long,
                       void *, void *, void *, unsigned long, unsigned long, unsigned long, void *);

extern State state;
extern void *original_slot;
extern void *gchandle_new(void *obj, int pinned);
extern void gchandle_free(void *handle);
extern void *object_get_class(void *obj);
extern int gettid(void);

void replacement(void *inst, void *pk, unsigned long confirm, unsigned long persist,
                 unsigned long open_ht, void *dismissed, void *displayed, void *dismissed_params,
                 unsigned long hide_ar, unsigned long post, unsigned long suppress, void *mi) {
  ShowFn orig = (ShowFn) original_slot;
  void *owner;
  void *hs, *hp, *hc;

  /* Inert unless a one-shot window is open and not yet consumed. */
  if (!state.enabled || state.captured) { FWD; return; }
  /* Thread gate: only the proven Unity thread that opened the window. */
  if (gettid() != state.tid) { FWD; return; }
  /* Argument-shape gate: single-pk post-encounter overload, no displayed/params delegates. */
  if (displayed != 0 || dismissed_params != 0 || (post & 0xff) != 1) { FWD; return; }
  if (dismissed == 0 || object_get_class(dismissed) != state.cls_action) { FWD; return; }
  owner = *(void **)((char *)dismissed + 0x20);                 /* Delegate.m_target */
  if (owner == 0 || object_get_class(owner) != state.cls_view) { FWD; return; }
  if (*(void **)((char *)owner + 0xe0) != state.response) { FWD; return; }  /* view.dsvw == expected response */
  if (pk == 0 || object_get_class(pk) != state.cls_pokemon) { FWD; return; }
  if (*(unsigned long *)((char *)pk + 0x20) != *(unsigned long *)((char *)state.response + 0x20)) { FWD; return; }
      /* PokemonProto.id_ == CatchPokemonOutProto.CapturedPokemonId */

  /* All gates passed. Root the three objects handed to JS. Unpinned, matching the
     quick-close hold() contract. Any failure frees partial handles and forwards. */
  hs = gchandle_new(inst, 0);
  hp = gchandle_new(pk, 0);
  hc = gchandle_new(dismissed, 0);
  if (hs == 0 || hp == 0 || hc == 0) {
    if (hs) gchandle_free(hs);
    if (hp) gchandle_free(hp);
    if (hc) gchandle_free(hc);
    FWD; return;
  }
  state.service_handle = hs;
  state.pk_handle = hp;
  state.callback_handle = hc;
  state.confirm = (unsigned int)(confirm & 0xff);
  state.persist = (unsigned int)(persist & 0xff);
  state.open_ht = (int)(unsigned int)(open_ht & 0xffffffff);
  state.hide_ar = (unsigned int)(hide_ar & 0xff);
  state.post = (unsigned int)(post & 0xff);
  state.suppress = (unsigned int)(suppress & 0xff);
  /* Publish the capture, then close the window (one-shot). Suppress the details UI
     by returning WITHOUT forwarding to the original ShowPokemonInfo. The captured
     dismissed Action is never invoked here; the caller runs it after the summary
     returns. */
  state.captured = 1;
  state.enabled = 0;
}
`;

function wantPtr(value, name) {
  if (!(value instanceof NativePointer) || value.isNull()) throw Error('bad-pointer:' + name);
  return value;
}

function create(config) {
  if (Process.arch !== 'arm64' || Process.pointerSize !== 8) throw Error('unsupported-architecture');
  if (!config || typeof config !== 'object') throw Error('bad-config');
  if (retained.length >= SESSION_LIMIT) throw Error('bridge-session-limit');

  const address = wantPtr(config.address, 'address');
  const gchandleNew = wantPtr(config.gchandle_new, 'gchandle_new');
  const gchandleFree = wantPtr(config.gchandle_free, 'gchandle_free');
  // get_target is validated for contract symmetry; target resolution is the caller's
  // job once end() transfers the handles, so the native module does not use it.
  wantPtr(config.get_target, 'get_target');
  const objectGetClass = wantPtr(config.object_get_class, 'object_get_class');
  const gettid = wantPtr(config.gettid, 'gettid');
  const view = wantPtr(config.view, 'view');
  const action = wantPtr(config.action, 'action');
  const pokemon = wantPtr(config.pokemon, 'pokemon');

  const state = Memory.alloc(STATE_SIZE);
  state.writeByteArray(new Uint8Array(STATE_SIZE)); // start fully inert and cleared
  state.add(OFF.clsView).writePointer(view);
  state.add(OFF.clsAction).writePointer(action);
  state.add(OFF.clsPokemon).writePointer(pokemon);

  // Pre-seed the slot with the real target so the extern is non-null the instant the
  // hook is live, then overwrite with the fast trampoline (mirrors nativebridge-adapter.js).
  const originalSlot = Memory.alloc(Process.pointerSize);
  originalSlot.writePointer(address);

  const cm = new CModule(SOURCE, {
    state,
    original_slot: originalSlot,
    gchandle_new: gchandleNew,
    gchandle_free: gchandleFree,
    object_get_class: objectGetClass,
    gettid
  });

  originalSlot.writePointer(Interceptor.replaceFast(address, cm.replacement));
  Interceptor.flush();

  // Defensive-only: the native path sets captured=1 solely after three non-null
  // handles, so this is never used on the normal transfer path.
  const freeHandle = new NativeFunction(gchandleFree, 'void', ['pointer']);

  const record = { cm, state, originalSlot, address };
  retained.push(record); // never removed; kept alive past revert
  let disposed = false;

  function begin(response, tid) {
    if (disposed) throw Error('disposed');
    const r = wantPtr(response, 'response');
    if (!Number.isInteger(tid) || tid <= 0) throw Error('bad-tid');
    if (state.add(OFF.enabled).readU32() !== 0) throw Error('window-already-open');
    if (state.add(OFF.captured).readU32() !== 0) throw Error('unconsumed-capture');
    // Reset capture slots, publish the gate inputs, THEN open the window.
    state.add(OFF.service).writePointer(ptr(0));
    state.add(OFF.pk).writePointer(ptr(0));
    state.add(OFF.callback).writePointer(ptr(0));
    state.add(OFF.response).writePointer(r);
    state.add(OFF.tid).writeS32(tid);
    state.add(OFF.enabled).writeU32(1);
    return true;
  }

  function end() {
    if (disposed) throw Error('disposed');
    // Always close the window first, even when nothing was captured.
    state.add(OFF.enabled).writeU32(0);
    if (state.add(OFF.captured).readU32() === 0) return null;

    const service = state.add(OFF.service).readPointer();
    const pk = state.add(OFF.pk).readPointer();
    const callback = state.add(OFF.callback).readPointer();
    // Consume the one-shot and drop our references; ownership is now the caller's.
    state.add(OFF.service).writePointer(ptr(0));
    state.add(OFF.pk).writePointer(ptr(0));
    state.add(OFF.callback).writePointer(ptr(0));
    state.add(OFF.captured).writeU32(0);

    if (service.isNull() || pk.isNull() || callback.isNull()) {
      // Broken native invariant: free what exists so nothing leaks, then surface it.
      for (const h of [service, pk, callback]) if (!h.isNull()) freeHandle(h);
      throw Error('captured-null-handle');
    }

    return {
      service, pokemon: pk, callback,
      confirm: state.add(OFF.confirm).readU32() !== 0,
      persist: state.add(OFF.persist).readU32() !== 0,
      openHyperTraining: state.add(OFF.openHyperTraining).readS32(),
      hideAr: state.add(OFF.hideAr).readU32() !== 0,
      post: state.add(OFF.post).readU32() !== 0,
      suppress: state.add(OFF.suppress).readU32() !== 0
    };
  }

  function dispose() {
    if (disposed) return;
    // Refuse to revert while a call could still be in flight or a capture is pending:
    // reverting then would leak the rooted handles and risk a use-after-free.
    if (state.add(OFF.enabled).readU32() !== 0) throw Error('dispose-window-open');
    if (state.add(OFF.captured).readU32() !== 0) throw Error('dispose-unconsumed-capture');
    Interceptor.revert(address);
    Interceptor.flush();
    disposed = true;
    // record stays in `retained` on purpose; the CModule/state/trampoline must outlive
    // any trampoline frame still unwinding on the Unity thread.
  }

  return Object.freeze({ begin, end, dispose });
}

root.PGRazorCatchPresentationBridge = Object.freeze({ create });

})(globalThis);
