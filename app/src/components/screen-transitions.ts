/**
 * How screens move, shared by every navigator so the app feels the same
 * everywhere. Spread these into a Stack's screenOptions or a screen's options.
 */

/** Moving to another screen: it slides in from the right, the previous one easing behind. */
export const pushTransition = { animation: 'ios_from_right' } as const;

/** A form over the current screen, such as adding an expense: it slides up. */
export const modalTransition = { presentation: 'modal', animation: 'slide_from_bottom' } as const;

/** Signing in or out replaces the whole app, so the two cross-fade. */
export const switchTransition = { animation: 'fade' } as const;

/** Switching bottom tabs: the screens shift slightly toward the tab chosen. */
export const tabTransition = { animation: 'shift' } as const;

/**
 * Font sizes for the bottom bar icons. Ionicons glyphs fill their box by
 * different amounts, so each gets the size at which it is drawn 24dp across,
 * the same as the profile photo (measured on a device).
 */
export const TAB_ICON_SIZES = { expenses: 25, add: 29 } as const;
/** The box each bottom bar icon sits in, a little larger so nothing is cut off. */
export const TAB_ICON_BOX = 32;
/** Icons in the top bars, such as the bell and members. */
export const HEADER_ICON_SIZE = 26;
