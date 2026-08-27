import React, {
  useEffect,
  useState,
} from "react";
import {
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from "react-native";

import type {
  AcceptedStarterTemplate,
} from "../../domains/plans";
import {
  AdaptiveScreen,
} from "../layout/AdaptiveScreen";
import {
  InlineNotice,
  PrimaryAction,
  ScreenHeader,
  SecondaryAction,
  SectionHeader,
  SkeletonBlock,
} from "../components";
import {
  space,
  typeScale,
  useAppTheme,
} from "../theme";

export type TemplateUpdatePreview = Readonly<{
  ownedPlanId: string;
  ownedPlanName: string;
  ownedPlanRevision: number;
  activeScheduleRevision: number | null;
  template: AcceptedStarterTemplate;
  sections: readonly Readonly<{
    title: string;
    changes: readonly Readonly<{
      kind: "Added" | "Removed" | "Changed" | "Unchanged";
      detail: string;
    }>[];
  }>[];
}>;

type TemplateUpdateScreenProps = Readonly<{
  ownedPlanId: string;
  templateId: string;
  loadUpdate(input: Readonly<{
    ownedPlanId: string;
    templateId: string;
  }>): Promise<TemplateUpdatePreview | null>;
  createNewCopy(preview: TemplateUpdatePreview): Promise<string>;
  onCreated(planId: string): void;
  onBack(): void;
  width?: number;
}>;

export function TemplateUpdateScreen({
  ownedPlanId,
  templateId,
  loadUpdate,
  createNewCopy,
  onCreated,
  onBack,
  width,
}: TemplateUpdateScreenProps) {
  const { colors } = useAppTheme();
  const [preview, setPreview] = useState<TemplateUpdatePreview | null>(null);
  const [state, setState] = useState<
    "loading" | "ready" | "empty" | "error"
  >("loading");
  const [retryGeneration, setRetryGeneration] = useState(0);
  const [busy, setBusy] = useState(false);
  const [createFailed, setCreateFailed] = useState(false);
  const [createdPlanId, setCreatedPlanId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setState("loading");
    void loadUpdate({ ownedPlanId, templateId }).then((value) => {
      if (!active) {
        return;
      }
      setPreview(value);
      setState(value === null ? "empty" : "ready");
    }).catch(() => {
      if (active) {
        setPreview(null);
        setState("error");
      }
    });
    return () => {
      active = false;
    };
  }, [loadUpdate, ownedPlanId, retryGeneration, templateId]);

  let content: React.ReactNode;
  if (state === "loading") {
    content = (
      <>
        {Array.from({ length: 5 }, (_, index) => (
          <SkeletonBlock
            height={index === 0 ? 96 : 72}
            key={index}
            testID={`template-update-skeleton-${index + 1}`}
          />
        ))}
      </>
    );
  } else if (state === "error") {
    content = (
      <InlineNotice
        action={
          <SecondaryAction
            label="Retry"
            onPress={() => setRetryGeneration((value) => value + 1)}
          />
        }
        body="Template update could not be loaded. Your existing copy was not changed."
        heading="Template update could not be loaded"
        tone="error"
      />
    );
  } else if (state === "empty" || preview === null) {
    content = (
      <InlineNotice
        body="Your copy already reflects the accepted template revision available on this device."
        heading="No template update available"
      />
    );
  } else if (createdPlanId !== null && preview !== null) {
    content = (
      <InlineNotice
        body={`${preview.ownedPlanName} remains unchanged. The new ${preview.template.displayName} copy is inactive and ready for comparison.`}
        heading="New copy created"
        tone="completed"
      />
    );
  } else {
    content = (
      <>
        <InlineNotice
          body={`${preview.ownedPlanName} stays unchanged. A new independent copy is created for comparison.`}
          heading="Template update available"
          tone="attention"
        />
        {createFailed ? (
          <InlineNotice
            body="A new copy could not be created. Your existing copy was not changed."
            heading="New copy could not be created"
            tone="error"
          />
        ) : null}
        {preview.sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <SectionHeader title={section.title} />
            {section.changes.map((change, index) => (
              <View
                key={`${section.title}:${index}`}
                style={[
                  styles.change,
                  { borderColor: colors.divider },
                ]}
              >
                <Text style={[
                  typeScale.label as TextStyle,
                  { color: colors.textPrimary },
                ]}>
                  {change.kind}
                </Text>
                <Text style={[
                  typeScale.body as TextStyle,
                  { color: colors.textSecondary },
                ]}>
                  {change.detail}
                </Text>
              </View>
            ))}
          </View>
        ))}
        <PrimaryAction
          busy={busy}
          label="Create new copy"
          onPress={() => {
            setBusy(true);
            setCreateFailed(false);
            void createNewCopy(preview).then((planId) => {
              setCreatedPlanId(planId);
              onCreated(planId);
            }).catch(() => {
              setCreateFailed(true);
            }).finally(() => setBusy(false));
          }}
        />
      </>
    );
  }

  return (
    <AdaptiveScreen
      primary={
        <>
          <ScreenHeader backAction={onBack} title="Template update" />
          {content}
        </>
      }
      testID="template-update"
      {...(width === undefined ? {} : { width })}
    />
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space[2],
  },
  change: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: space[1],
    paddingBottom: space[2],
  },
});
