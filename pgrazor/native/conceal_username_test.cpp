#include "conceal_username.h"
#include <cassert>
#include <cstdio>
#include <string>

using namespace pgr_conceal_username;

int main() {
  // 1. Config parsing (U1 legacy + U2 custom alphanumeric).
  const Config on = parse("U1|1");
  const Config off = parse("U1|0");
  assert(on.valid && on.enabled && on.replacement == "noneofyourbusiness");
  assert(off.valid && !off.enabled && off.replacement == "noneofyourbusiness");
  const Config u2_on = parse("U2|1|Player42");
  const Config u2_off = parse("U2|0|Ash99");
  const Config u2_max = parse("U2|1|ABCDEFGHIJ1234567890abcd");
  assert(u2_on.valid && u2_on.enabled && u2_on.replacement == "Player42" && u2_on.replacement_utf16 == u"Player42");
  assert(u2_off.valid && !u2_off.enabled && u2_off.replacement == "Ash99");
  assert(u2_max.valid && u2_max.enabled && u2_max.replacement.size() == 24);
  const char *const bads[] = {
    nullptr, "", "U1", "U1|2", "U1|-1", "U2|1", "U2|1|", "U2|1|bad name", "U2|1|bad_name",
    "U2|1|bad|name", "U2|1|non\xC3\xA9", "U2|1|1234567890123456789012345",
    "U1|1|0", "U1|1x", "u1|1", "U3|1|abc"
  };
  for (const char *bad : bads) {
    const Config c = parse(bad);
    assert(!c.valid && !c.enabled);
  }

  // 2. Exact match triggers fast path (no allocation needed).
  const std::u16string name = u"Ash";
  const std::u16string exact_in = u"Ash";
  std::u16string out;
  bool exact = false;
  assert(replace_username_utf16(
      reinterpret_cast<const uint16_t*>(exact_in.data()), int32_t(exact_in.size()),
      reinterpret_cast<const uint16_t*>(name.data()), int32_t(name.size()), out, exact));
  assert(exact);

  // 3. Rich text tags & dialogue sentences replace on word boundaries.
  const std::u16string rich = u"<b>Ash</b>!";
  assert(replace_username_utf16(
      reinterpret_cast<const uint16_t*>(rich.data()), int32_t(rich.size()),
      reinterpret_cast<const uint16_t*>(name.data()), int32_t(name.size()), out, exact));
  assert(!exact && out == u"<b>noneofyourbusiness</b>!");

  const std::u16string dialogue = u"Welcome back, Ash! Ready to battle, Ash?";
  assert(replace_username_utf16(
      reinterpret_cast<const uint16_t*>(dialogue.data()), int32_t(dialogue.size()),
      reinterpret_cast<const uint16_t*>(name.data()), int32_t(name.size()), out, exact));
  assert(!exact && out == u"Welcome back, noneofyourbusiness! Ready to battle, noneofyourbusiness?");

  // 4. Word boundaries do not corrupt unrelated words or superstring names.
  const std::u16string unrelated = u"Crashed! Flash vs Asher and Ash123";
  assert(!replace_username_utf16(
      reinterpret_cast<const uint16_t*>(unrelated.data()), int32_t(unrelated.size()),
      reinterpret_cast<const uint16_t*>(name.data()), int32_t(name.size()), out, exact));

  // 5. Idempotency when the replacement literal itself is passed (including if trainer name == replacement).
  const std::u16string rep = u"noneofyourbusiness";
  assert(!replace_username_utf16(
      reinterpret_cast<const uint16_t*>(rep.data()), int32_t(rep.size()),
      reinterpret_cast<const uint16_t*>(name.data()), int32_t(name.size()), out, exact));
  assert(!replace_username_utf16(
      reinterpret_cast<const uint16_t*>(rep.data()), int32_t(rep.size()),
      reinterpret_cast<const uint16_t*>(rep.data()), int32_t(rep.size()), out, exact));

  // 6. Short (< 2) or empty trainer name is rejected.
  const std::u16string single = u"A";
  assert(!replace_username_utf16(
      reinterpret_cast<const uint16_t*>(single.data()), 1,
      reinterpret_cast<const uint16_t*>(single.data()), 1, out, exact));

  // 7. UTF-16 surrogate pair encoding into UTF-8.
  const std::u16string emoji_name = u"P\u00e9";
  const std::u16string greeting = u"\U0001F525 P\u00e9!";
  assert(replace_username_utf16(
      reinterpret_cast<const uint16_t*>(greeting.data()), int32_t(greeting.size()),
      reinterpret_cast<const uint16_t*>(emoji_name.data()), int32_t(emoji_name.size()), out, exact));
  const std::string utf8 = utf16_to_utf8(out.data(), out.size());
  assert(utf8 == "\xF0\x9F\x94\xA5 noneofyourbusiness!");

  // 8. Custom alphanumeric replacement & idempotency when trainer name is substring of replacement.
  const std::u16string custom = u"Ash99";
  assert(replace_username_utf16(
      reinterpret_cast<const uint16_t*>(dialogue.data()), int32_t(dialogue.size()),
      reinterpret_cast<const uint16_t*>(name.data()), int32_t(name.size()),
      custom.data(), custom.size(), out, exact));
  assert(!exact && out == u"Welcome back, Ash99! Ready to battle, Ash99?");
  // Re-running on replaced output does not re-match "Ash" inside "Ash99".
  assert(!replace_username_utf16(
      reinterpret_cast<const uint16_t*>(out.data()), int32_t(out.size()),
      reinterpret_cast<const uint16_t*>(name.data()), int32_t(name.size()),
      custom.data(), custom.size(), out, exact));
  // Exact match with trainer name equal to custom replacement is a no-op.
  assert(!replace_username_utf16(
      reinterpret_cast<const uint16_t*>(custom.data()), int32_t(custom.size()),
      reinterpret_cast<const uint16_t*>(custom.data()), int32_t(custom.size()),
      custom.data(), custom.size(), out, exact));

  std::puts("conceal_username_test: PASS");
  return 0;
}
