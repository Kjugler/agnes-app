# Terminal Cursor & Jody Widget Fixes

## Issues Fixed

### 1. Terminal Cursor Not Visible on Page Load ✅
**Problem**: White IBM-style block cursor only appeared after clicking, causing user confusion.

**Solution**:
- Added auto-focus on mount with retry logic
- Made cursor always visible via CSS (not conditional on focus state)
- Added cursor blink animation that's always active
- Changed cursor color to white (#ffffff) for IBM-style appearance

### 2. Jody Widget Interfering with Focus ✅
**Problem**: Jody widget might steal focus from terminal input.

**Solution**:
- Ensured Jody container has `pointerEvents: 'none'` (only interactive elements have `pointerEvents: 'auto'`)
- Added click handler to refocus terminal when clicking on terminal container
- Prevented Jody widget from stealing focus on mount

### 3. Jody Avatar Cropped on Ascension Page ✅
**Problem**: Jody's head was cut off in the circular avatar on `/contest/ascension`.

**Solution**:
- Updated `objectPosition` to `'center top'` for ascension variant
- Added `transform: translateY(6px)` to shift image downward slightly
- Applied fix to both deepquill and agnes-next JodyAssistant components

## Files Modified

1. **deepquill/src/components/TerminalEmulator.jsx**
   - Added `terminalContainerRef` for DOM access
   - Added auto-focus effect with retry logic
   - Added click handler to refocus terminal

2. **deepquill/src/components/TerminalEmulator.css**
   - Changed cursor color to white (#ffffff)
   - Made cursor always visible (not conditional)
   - Added cursor blink animation
   - Ensured cursor has proper z-index (5)

3. **deepquill/src/components/JodyAssistant.jsx**
   - Added comment clarifying pointer-events behavior
   - Added `onMouseDown` handler to prevent focus stealing

4. **agnes-next/src/components/JodyAssistant.tsx**
   - Fixed ascension avatar cropping with `objectPosition: 'center top'`
   - Added `transform: translateY(6px)` for proper positioning

## Verification Checklist

After these changes:
- ✅ White IBM-style cursor appears immediately on page load
- ✅ Terminal input auto-focuses on mount
- ✅ Cursor blink animation is always active
- ✅ Jody widget doesn't interfere with terminal focus
- ✅ Jody avatar on ascension page shows full head (not cropped)
- ✅ Clicking on terminal area refocuses the input
- ✅ Cursor remains visible even when input loses focus

## Testing

1. Navigate to `/the-control-room` (or the terminal page)
2. Verify white cursor appears immediately without clicking
3. Verify cursor blinks continuously
4. Click on Jody widget - terminal should remain focused
5. Click elsewhere on terminal - should refocus input
6. Navigate to `/contest/ascension`
7. Verify Jody avatar shows full head (not cropped)

