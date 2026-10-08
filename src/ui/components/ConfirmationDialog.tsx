import React, { useEffect, useRef, useState } from "react";
import { Text, View, type TextStyle } from "react-native";

import { BottomSheet, useBottomSheetCancel } from "./BottomSheet";
import { SecondaryAction } from "./index";
import { typeScale, useAppTheme } from "../theme";

type FocusTarget = Readonly<{ focus?: () => void }>;

type ConfirmationDialogActionsProps = Readonly<{
  alternateLabel?: string | undefined;
  cancelLabel: string;
  cancelRef: React.RefObject<View | null>;
  confirmBusy: boolean;
  confirmDisabled: boolean;
  confirmLabel: string;
  confirmTestID?: string | undefined;
  destructive: boolean;
  onAlternate?: (() => void) | undefined;
  onCancel: () => void;
  onConfirm: () => void;
  visible: boolean;
}>;

function ConfirmationDialogActions({
  alternateLabel,
  cancelLabel,
  cancelRef,
  confirmBusy,
  confirmDisabled,
  confirmLabel,
  confirmTestID,
  destructive,
  onAlternate,
  onCancel,
  onConfirm,
  visible,
}: ConfirmationDialogActionsProps) {
  const cancelSheet = useBottomSheetCancel();
  const [submitting, setSubmitting] = useState(false);
  const busy = confirmBusy || submitting;
  const confirmActionDisabled = busy || confirmDisabled;

  useEffect(() => {
    if (!visible || !confirmBusy) setSubmitting(false);
  }, [confirmBusy, confirmLabel, visible]);

  const confirm = () => {
    if (confirmActionDisabled) return;
    setSubmitting(true);
    onConfirm();
  };

  return (
    <>
      <SecondaryAction
        busy={busy}
        disabled={busy}
        label={cancelLabel}
        onPress={cancelSheet ?? onCancel}
        ref={cancelRef}
      />
      {alternateLabel === undefined || onAlternate === undefined ? null : (
        <SecondaryAction destructive={destructive} label={alternateLabel} onPress={onAlternate} />
      )}
      <SecondaryAction
        busy={busy}
        disabled={confirmActionDisabled}
        destructive={destructive}
        label={confirmLabel}
        onPress={confirm}
        {...(confirmTestID === undefined ? {} : { testID: confirmTestID })}
      />
    </>
  );
}

export type ConfirmationDialogProps = Readonly<{
  visible: boolean;
  heading: string;
  body: string;
  cancelLabel: string;
  confirmLabel: string;
  confirmTestID?: string | undefined;
  confirmBusy?: boolean;
  confirmDisabled?: boolean;
  alternateLabel?: string | undefined;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onAlternate?: (() => void) | undefined;
  initialFocusRef?: React.RefObject<FocusTarget | null> | undefined;
  restoreFocusRef?: React.RefObject<FocusTarget | null> | undefined;
  scrollTestID?: string | undefined;
  children?: React.ReactNode;
}>;

/** A consequential BottomSheet with caller-owned command state and idempotency. */
export function ConfirmationDialog({
  visible,
  heading,
  body,
  cancelLabel,
  confirmLabel,
  confirmTestID,
  confirmBusy = false,
  confirmDisabled = false,
  alternateLabel,
  destructive = false,
  onCancel,
  onConfirm,
  onAlternate,
  initialFocusRef,
  restoreFocusRef,
  scrollTestID,
  children,
}: ConfirmationDialogProps) {
  const { colors } = useAppTheme();
  const cancelRef = useRef<View>(null);

  return (
    <BottomSheet
      consequenceMode
      heading={heading}
      initialFocusRef={initialFocusRef ?? cancelRef}
      onCancel={onCancel}
      restoreFocusRef={restoreFocusRef}
      scrollTestID={scrollTestID}
      visible={visible}
    >
      <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>
        {body}
      </Text>
      {children}
      <ConfirmationDialogActions
        alternateLabel={alternateLabel}
        cancelLabel={cancelLabel}
        cancelRef={cancelRef}
        confirmBusy={confirmBusy}
        confirmDisabled={confirmDisabled}
        confirmLabel={confirmLabel}
        confirmTestID={confirmTestID}
        destructive={destructive}
        onAlternate={onAlternate}
        onCancel={onCancel}
        onConfirm={onConfirm}
        visible={visible}
      />
    </BottomSheet>
  );
}
