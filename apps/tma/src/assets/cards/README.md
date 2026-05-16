# Card Art Assets

Optimized PNG card artwork lives here. The frontend auto-detects these files through `MoveArt`.

Expected files:

| Move | Basic UI | Enhanced UI |
|------|----------|-------------|
| Earth | `Earth_Common.png` | `Earth_Epic.png` |
| Fire | `Fire_Common.png` | `Fire_Epic.png` |
| Water | `Water_Common.png` | `Water_Epic.png` |

Generated `Rare` and `Immortal` variants are also included so the asset set matches the original handoff contract:

- `Earth_Rare.png`
- `Earth_Immortal.png`
- `Fire_Rare.png`
- `Fire_Immortal.png`
- `Water_Rare.png`
- `Water_Immortal.png`

Keep each mobile asset below 200 KB. If a file is missing, the UI falls back to the existing element icon. Original production art can replace these PNGs without code changes if filenames stay the same.
