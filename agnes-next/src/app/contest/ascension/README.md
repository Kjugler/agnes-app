# Ascension Page Layout

## Intended Design

The Ascension page displays two red doors in a cloud-filled sky background. Each door navigates to a different section of the contest.

## Layout Structure

- **Background**: Cloud gradient with photographic cloud layer and silhouettes
- **Doors**: Two red doors displayed side-by-side in a grid
  - Left door: "See My Score" → `/contest/score`
  - Right door: "Explore Badges" → `/contest/Badges`
- **Visual Elements**: 
  - Red door images (`/images/ascension/door-red.png`)
  - Gold labels on doors
  - Metallic knobs
  - Cloud animations

## Key Files

- `page.tsx` - Main component (uses RedDoor-style buttons)
- `page.module.css` - Door animations and cloud effects
- `../styles/ascension.css` - Layout grid and door styling

## Do Not Replace

- **Do NOT** replace red doors with phone-frame variants
- **Do NOT** change the door navigation structure
- **Do NOT** remove the cloud background layers

