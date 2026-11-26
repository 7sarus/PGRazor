#include "pokemon_dump.h"
#include <cassert>
#include <cstdio>
#include <string>
#include <vector>

int main() {
  assert(pgr_format_pokemon_move_name(nullptr).empty());
  assert(pgr_format_pokemon_move_name("").empty());
  assert(pgr_format_pokemon_move_name("MoveUnset").empty());
  assert(pgr_format_pokemon_move_name("VnBm001").empty());
  assert(pgr_format_pokemon_move_name("123").empty());
  assert(pgr_format_pokemon_move_name("V0224MovePoisonJabFast") == "POISON_JAB_FAST");
  assert(pgr_format_pokemon_move_name("V0031MoveEarthquake") == "EARTHQUAKE");
  assert(pgr_format_pokemon_move_name("V0100MoveXScissor") == "X_SCISSOR");
  assert(pgr_format_pokemon_move_name("V0342MoveVCreate") == "V_CREATE");
  assert(pgr_format_pokemon_move_name("V0235MoveConfusionFast") == "CONFUSION_FAST");
  assert(pgr_format_pokemon_move_name("PSYSTRIKE") == "PSYSTRIKE");
  assert(pgr_format_pokemon_move_name("CONFUSION_FAST") == "CONFUSION_FAST");

  auto empty = pgr_build_pokemon_dump_chunks(7, true, {}, 512);
  assert(empty.size() == 1);
  assert(empty[0] == "{\"token\":7,\"phase\":\"done\",\"index\":0,\"count\":1,\"named\":true,\"pokemon\":[]}");

  std::vector<std::string> rows(5, "{\"dex\":1}");
  auto multi = pgr_build_pokemon_dump_chunks(9, false, rows, 160);
  assert(multi.size() == 2);
  assert(multi[0].find("\"phase\":\"part\",\"index\":0,\"count\":2,\"named\":false") != std::string::npos);
  assert(multi[1].find("\"phase\":\"done\",\"index\":1,\"count\":2,\"named\":false") != std::string::npos);

  std::puts("pokemon_dump_test: PASS");
  return 0;
}
