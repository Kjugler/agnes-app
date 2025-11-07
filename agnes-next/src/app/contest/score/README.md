# Score Page Layout

## Intended Design

The Score page uses a "caption stage + ship + mist" layout with interactive buttons.

## Layout Structure

### Top Third: Caption Stage
- Displays greeting messages, info text, and hover captions
- Runs through sequence: greetings → info → idle/hover
- Scales responsively with viewport
- Centered text with readable styling

### Bottom Two-Thirds: Ship Area
- Ship background image (`/images/score-bg.jpg`)
- Mist overlay that clears on hover (controlled by `--mist` CSS variable)
- Button grid using `grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))`
- Progress bars in foreground above buttons

## Key Features

- **Mist State**: Starts light (0.08-0.15), reduces on hover
- **Caption FSM**: greetings → info → idle → hover
- **Button Hover**: Shows captions and reduces mist
- **Share Handlers**: Facebook, X, Instagram, TikTok, Truth Social

## Key Files

- `page.tsx` - Main component with all handlers
- `../styles/score.css` - Layout grid, caption stage, ship area, buttons

## Do Not Replace

- **Do NOT** replace with phone-frame variants
- **Do NOT** remove caption stage FSM
- **Do NOT** change button grid to flex-wrap (causes overlap)
- **Do NOT** remove mist overlay logic

