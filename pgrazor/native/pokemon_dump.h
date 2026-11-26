#pragma once
#include <stdint.h>
#ifdef __cplusplus
#include <cctype>
#include <string>
#include <vector>

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

// Splits serialized JSON row strings into bounded "part"/"done" envelopes so large bags stay
// well below the transport queue byte budget without losing rows.
inline std::vector<std::string> pgr_build_pokemon_dump_chunks(
    uint64_t token, bool named, const std::vector<std::string> &rows, size_t max_bytes) {
  std::vector<std::vector<size_t>> groups;
  size_t cur_bytes = 0;
  constexpr size_t kEnvelopeMargin = 128;
  for (size_t i = 0; i < rows.size(); ++i) {
    const size_t add = rows[i].size() + 1;
    if (groups.empty() || (!groups.back().empty() && kEnvelopeMargin + cur_bytes + add > max_bytes)) {
      groups.emplace_back();
      cur_bytes = 0;
    }
    groups.back().push_back(i);
    cur_bytes += add;
  }
  if (groups.empty()) groups.emplace_back();
  std::vector<std::string> out;
  out.reserve(groups.size());
  const size_t count = groups.size();
  for (size_t idx = 0; idx < count; ++idx) {
    std::string chunk = "{\"token\":" + std::to_string(token)
        + ",\"phase\":\"" + (idx + 1 == count ? "done" : "part") + "\""
        + ",\"index\":" + std::to_string(idx)
        + ",\"count\":" + std::to_string(count)
        + ",\"named\":" + (named ? "true" : "false")
        + ",\"pokemon\":[";
    for (size_t k = 0; k < groups[idx].size(); ++k) {
      if (k > 0) chunk += ',';
      chunk += rows[groups[idx][k]];
    }
    chunk += "]}";
    out.push_back(std::move(chunk));
  }
  return out;
}
#endif
struct PgrSharedMetadataOutput;
void pgr_pokemon_dump_tick(uint64_t,const PgrSharedMetadataOutput*);
