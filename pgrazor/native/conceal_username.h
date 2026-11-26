#pragma once
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>

struct PgrSharedMetadataOutput;

// Conceal username: while enabled, replaces the active account's trainer name in Unity text
// setters and dialogue speech calls with "noneofyourbusiness", without altering IPlayerService
// itself so account management and game requests keep working. Settings ride transport string
// slot 27 ("U1|0" or "U1|1"). Unity owner thread only.
void pgr_conceal_username_tick(uint64_t tid, const PgrSharedMetadataOutput *metadata);
void pgr_conceal_username_stop(uint64_t tid);

namespace pgr_conceal_username {

inline constexpr const char *kReplacement = "noneofyourbusiness";
inline constexpr const char16_t kReplacementUtf16[] = u"noneofyourbusiness";
inline constexpr size_t kReplacementLen = 18;

struct Config {
  bool valid = false;
  bool enabled = false;
};

// "U1|0" or "U1|1"; anything else is invalid (off).
inline Config parse(const char *s) {
  Config c;
  int on = 0, end = 0;
  if (!s || std::sscanf(s, "U1|%d%n", &on, &end) != 1 || s[end] || (on != 0 && on != 1)) return c;
  c.valid = true;
  c.enabled = (on == 1);
  return c;
}

inline bool is_word_char(uint16_t c) {
  return (c >= '0' && c <= '9') || (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c == '_' || c >= 0x80;
}

// Replaces bounded occurrences of the trainer name with "noneofyourbusiness". Returns true only
// when text changed; sets exact_replacement when text equals name verbatim so callers can reuse
// a single pinned replacement string without allocating.
inline bool replace_username_utf16(const uint16_t *text, int32_t len, const uint16_t *name,
                                   int32_t name_len, std::u16string &out, bool &exact_replacement) {
  exact_replacement = false;
  if (!text || !name || name_len < 2 || len < name_len) return false;
  if (size_t(name_len) == kReplacementLen &&
      std::memcmp(name, kReplacementUtf16, kReplacementLen * sizeof(uint16_t)) == 0) {
    return false;
  }
  if (len == name_len && std::memcmp(text, name, size_t(name_len) * sizeof(uint16_t)) == 0) {
    exact_replacement = true;
    return true;
  }
  out.clear();
  bool changed = false;
  int32_t i = 0;
  int32_t last = 0;
  while (i <= len - name_len) {
    const bool before_ok = (i == 0) || !is_word_char(text[i - 1]);
    const bool after_ok = (i + name_len == len) || !is_word_char(text[i + name_len]);
    if (before_ok && after_ok && std::memcmp(text + i, name, size_t(name_len) * sizeof(uint16_t)) == 0) {
      if (!changed) out.reserve(size_t(len) + kReplacementLen);
      for (int32_t k = last; k < i; ++k) out.push_back(char16_t(text[k]));
      out.append(kReplacementUtf16, kReplacementLen);
      changed = true;
      i += name_len;
      last = i;
    } else {
      ++i;
    }
  }
  if (!changed) return false;
  for (int32_t k = last; k < len; ++k) out.push_back(char16_t(text[k]));
  return true;
}

inline std::string utf16_to_utf8(const char16_t *data, size_t len) {
  std::string out;
  out.reserve(len);
  for (size_t i = 0; i < len; ++i) {
    uint32_t cp = uint16_t(data[i]);
    if (cp >= 0xD800 && cp <= 0xDBFF) {
      if (i + 1 < len) {
        const uint32_t lo = uint16_t(data[i + 1]);
        if (lo >= 0xDC00 && lo <= 0xDFFF) {
          cp = 0x10000 + (((cp - 0xD800) << 10) | (lo - 0xDC00));
          ++i;
        } else {
          cp = 0xFFFD;
        }
      } else {
        cp = 0xFFFD;
      }
    } else if (cp >= 0xDC00 && cp <= 0xDFFF) {
      cp = 0xFFFD;
    }
    if (cp < 0x80) {
      out.push_back(char(cp));
    } else if (cp < 0x800) {
      out.push_back(char(0xC0 | (cp >> 6)));
      out.push_back(char(0x80 | (cp & 0x3F)));
    } else if (cp < 0x10000) {
      out.push_back(char(0xE0 | (cp >> 12)));
      out.push_back(char(0x80 | ((cp >> 6) & 0x3F)));
      out.push_back(char(0x80 | (cp & 0x3F)));
    } else {
      out.push_back(char(0xF0 | (cp >> 18)));
      out.push_back(char(0x80 | ((cp >> 12) & 0x3F)));
      out.push_back(char(0x80 | ((cp >> 6) & 0x3F)));
      out.push_back(char(0x80 | (cp & 0x3F)));
    }
  }
  return out;
}

}  // namespace pgr_conceal_username
