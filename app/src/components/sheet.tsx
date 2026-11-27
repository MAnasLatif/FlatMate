import { BottomSheet, type BottomSheetProps, type BottomSheetRef } from 'heroui-native';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ScrollView } from 'react-native';

type SheetProps = Omit<BottomSheetProps, 'children' | 'onDidDismiss'> & {
  isOpen: boolean;
  /** Called with false when the person closes the sheet: a drag, a tap outside or Back. */
  onOpenChange: (isOpen: boolean) => void;
  children: ReactNode;
};

/**
 * HeroUI's native BottomSheet, opened and closed by `isOpen` like a dialog.
 *
 * The native sheet is driven through its ref, so this presents it when
 * `isOpen` turns true and dismisses it when it turns false. Its content mounts
 * on each opening and unmounts once the sheet has closed, so every opening
 * starts fresh and nothing in a closed sheet loads or runs.
 */
export function Sheet({ isOpen, onOpenChange, children, ...props }: SheetProps) {
  const sheetRef = useRef<BottomSheetRef>(null);
  const isPresented = useRef(false);
  const isOpenRef = useRef(isOpen);
  const onOpenChangeRef = useRef(onOpenChange);
  // Stays true while the sheet slides away after closing, so its content goes with it.
  const [isShown, setShown] = useState(isOpen);
  if (isOpen && !isShown) setShown(true);

  useEffect(() => {
    isOpenRef.current = isOpen;
    onOpenChangeRef.current = onOpenChange;
  });

  useEffect(() => {
    if (isOpen && !isPresented.current) {
      isPresented.current = true;
      void sheetRef.current?.present();
    } else if (!isOpen && isPresented.current) {
      isPresented.current = false;
      void sheetRef.current?.dismiss();
    }
  }, [isOpen]);

  return (
    <BottomSheet
      ref={sheetRef}
      {...props}
      onDidDismiss={() => {
        isPresented.current = false;
        setShown(false);
        if (isOpenRef.current) onOpenChangeRef.current(false);
      }}
    >
      {/* The native sheet is a surface of its own, but its content stays in the
          React tree of the screen behind it. Lists in it would otherwise count
          as nested in that screen's scroll view, and React Native warns. */}
      <ScrollView.Context.Provider value={null}>
        {isShown ? children : null}
      </ScrollView.Context.Provider>
    </BottomSheet>
  );
}
