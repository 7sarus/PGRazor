#pragma once
#include <stdint.h>
#ifdef __cplusplus
#include <cctype>
#include <string>

// Converts HoloPokemonMove literals ("V0224MovePoisonJabFast" -> "POISON_JAB_FAST") or preserves
// UPPER_SNAKE names ("PSYSTRIKE"); skips "MoveUnset" and obfuscated placeholders ("VnBm001").
inline std::string pgr_format_pokemon_move_name(const char *raw) {
  if (!raw || !*raw) return {};
  std::string s(raw);
  if (s == "MoveUnset") return {};
  if (s.size() > 6 && s[0] == 'V' && std::isdigit(static_cast<unsigned char>(s[1]))) {
    size_t i = 1;
    while (i < s.size() && std::isdigit(static_cast<unsigned char>(s[i]))) ++i;
    if (s.compare(i, 4, "Move") == 0 && i + 4 < s.size()) {
      const std::string body = s.substr(i + 4);
      std::string out;
      out.reserve(body.size() + 6);
      for (size_t j = 0; j < body.size(); ++j) {
        const unsigned char c = static_cast<unsigned char>(body[j]);
        if (!std::isalnum(c)) return {};
        if (j > 0 && std::isupper(c)) {
          const unsigned char prev = static_cast<unsigned char>(body[j - 1]);
          const bool next_lower = j + 1 < body.size() && std::islower(static_cast<unsigned char>(body[j + 1]));
          if (std::islower(prev) || std::isdigit(prev) || (std::isupper(prev) && next_lower)) {
            out += '_';
          }
        }
        out += static_cast<char>(std::toupper(c));
      }
      return out;
    }
  }
  bool has_alpha = false;
  for (unsigned char c : s) {
    if (std::isupper(c)) has_alpha = true;
    else if (!std::isdigit(c) && c != '_') return {};
  }
  return has_alpha ? s : std::string{};
}
#endif
struct PgrSharedMetadataOutput;
void pgr_pokemon_dump_tick(uint64_t,const PgrSharedMetadataOutput*);
