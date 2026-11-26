#include "pokemon_dump.h"
#include <cassert>
#include <cstdio>

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
  std::puts("pokemon_dump_test: PASS");
  return 0;
}
