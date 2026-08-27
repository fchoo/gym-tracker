import React, {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Star,
} from "lucide-react-native";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type TextStyle,
} from "react-native";

import type {
  ContentUpdateResult,
} from "../../domains/content/catalog";
import type {
  SearchFilters,
} from "../../domains/library/search";
import {
  AdaptiveScreen,
} from "../layout/AdaptiveScreen";
import {
  ActionCluster,
  ContentCard,
  FocusablePressable,
  IconAction,
  InlineNotice,
  PlanRow,
  PrimaryAction,
  ScreenHeader,
  SectionHeader,
  SecondaryAction,
  SkeletonBlock,
} from "../components";
import {
  radius,
  sizes,
  space,
  typeScale,
  useAppTheme,
} from "../theme";

export type LibrarySection = "plans" | "exercises";

export type LibrarySectionPreference = Readonly<{
  section: LibrarySection;
  revision: number;
}>;

export type LibraryPlanSummary = Readonly<{
  id: string;
  name: string;
  daysPerWeek: number;
  status?: "Active" | "Draft" | "Archived" | "Inactive";
  scheduleSummary?: string;
  missingRequirement?: string | null;
  templateUpdateTemplateId?: string;
}>;

export type LibraryStarterPlanSummary = Readonly<{
  id: string;
  ordinal?: number;
  name: string;
  daysPerWeek: number;
  goal: string;
  experience: string;
  equipment: readonly string[];
  estimateMinutes: number;
}>;

export type LibraryExerciseItem = Readonly<{
  exerciseId: string;
  canonicalName: string;
  matchedAlias: Readonly<{
    id: number;
    displayText: string;
    label: string;
  }> | null;
  exerciseType: string;
  origin: "bundled" | "copied" | "custom";
  originLabel: "Built-in" | "Custom";
  availability: "available" | "unavailable";
  favorite: boolean;
  hidden: boolean;
  archived: boolean;
  recentAtMs: number | null;
  muscles: readonly string[];
  equipment: readonly string[];
  source: Readonly<{
    namespace: string;
    revision: string;
    license: string;
    attribution: string;
  }> | null;
}>;

export type LibraryExerciseSearchResult =
  | Readonly<{
      state: "page";
      items: readonly LibraryExerciseItem[];
      nextCursor: string | null;
    }>
  | Readonly<{
      state: "restart";
      reason: string;
    }>;

export type LibraryBrowseSnapshot = Readonly<{
  sectionPreference: LibrarySectionPreference;
  plans: Readonly<{
    active: LibraryPlanSummary | null;
    owned: readonly LibraryPlanSummary[];
    starters: readonly LibraryStarterPlanSummary[];
  }>;
  exerciseFilterOptions?: Readonly<{
    exerciseTypes: readonly string[];
    muscles: readonly string[];
    equipment: readonly string[];
  }>;
}>;

type SectionProcessState = Readonly<{
  query: string;
  filters: SearchFilters;
  selectedId: string | null;
}>;

export type LibrarySectionState = Readonly<Record<
  LibrarySection,
  SectionProcessState
>>;

type LibraryScreenProps = Readonly<{
  loadLibrary(): Promise<LibraryBrowseSnapshot>;
  refreshLibrary?(): Promise<LibraryBrowseSnapshot>;
  onCreateExercise(): void;
  onCreatePlan(): void;
  onOpenExercise(exerciseId: string): void;
  onOpenPlan(planId: string): void;
  onOpenStarter?(templateId: string): void;
  onOpenTemplateUpdate?(input: Readonly<{
    ownedPlanId: string;
    templateId: string;
  }>): void;
  onReviewChanges?(result: ContentUpdateResult): void;
  contentUpdateResult?: ContentUpdateResult;
  contentUpdateFailed?: true;
  listRecentExercises(): Promise<readonly LibraryExerciseItem[]>;
  searchExercises(input: Readonly<{
    query: string;
    filters?: SearchFilters;
    cursor?: string | null;
  }>): Promise<LibraryExerciseSearchResult>;
  setExerciseFavorite(
    exerciseId: string,
    favorite: boolean,
  ): Promise<Readonly<{
    exerciseId: string;
    favorite: boolean;
    preferenceRevision: number;
  }>>;
  setSection(
    section: LibrarySection,
    expectedRevision: number,
  ): Promise<LibrarySectionPreference>;
  width?: number;
}>;

type ExerciseBrowseState = Readonly<{
  favorites: readonly LibraryExerciseItem[];
  items: readonly LibraryExerciseItem[];
  recent: readonly LibraryExerciseItem[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  initialError: boolean;
  pageError: boolean;
}>;

type StarterFilters = Readonly<{
  goals?: readonly string[];
  experience?: readonly string[];
  daysPerWeek?: readonly number[];
  equipment?: readonly string[];
}>;

const initialExerciseBrowseState: ExerciseBrowseState = {
  favorites: [],
  items: [],
  recent: [],
  nextCursor: null,
  loading: true,
  loadingMore: false,
  initialError: false,
  pageError: false,
};

const initialProcessState = (): LibrarySectionState => ({
  plans: {
    query: "",
    filters: {},
    selectedId: null,
  },
  exercises: {
    query: "",
    filters: {},
    selectedId: null,
  },
});

function filterCount(filters: SearchFilters): number {
  return Object.values(filters).reduce(
    (count, values) => count + (values?.length ?? 0),
    0,
  );
}

function displayFilterValue(value: string): string {
  return value.split(/[-_]/u).map((word) =>
    `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`
  ).join(" ");
}

function starterFilterCount(filters: StarterFilters): number {
  return Object.values(filters).reduce(
    (count, values) => count + (values?.length ?? 0),
    0,
  );
}

type FilterChip = Readonly<{
  key: keyof SearchFilters;
  label: string;
  value: string | boolean;
}>;

function filterChips(filters: SearchFilters): readonly FilterChip[] {
  return [
    ...(filters.exerciseTypes ?? []).map((value) => ({
      key: "exerciseTypes" as const,
      label: `Exercise type: ${displayFilterValue(value)}`,
      value,
    })),
    ...(filters.muscles ?? []).map((value) => ({
      key: "muscles" as const,
      label: `Muscle: ${displayFilterValue(value)}`,
      value,
    })),
    ...(filters.equipment ?? []).map((value) => ({
      key: "equipment" as const,
      label: `Equipment: ${displayFilterValue(value)}`,
      value,
    })),
    ...(filters.origins ?? []).map((value) => ({
      key: "origins" as const,
      label: `Origin: ${displayFilterValue(value)}`,
      value,
    })),
    ...(filters.visibility ?? []).map((value) => ({
      key: "visibility" as const,
      label: `Visibility: ${displayFilterValue(value)}`,
      value,
    })),
    ...(filters.recent ?? []).map((value) => ({
      key: "recent" as const,
      label: value ? "Recent use" : "Not recent",
      value,
    })),
    ...(filters.favorite ?? []).map((value) => ({
      key: "favorite" as const,
      label: value ? "Favorite" : "Not favorite",
      value,
    })),
  ];
}

function removeFilterChip(
  filters: SearchFilters,
  chip: FilterChip,
): SearchFilters {
  const current = filters[chip.key];
  if (current === undefined) {
    return filters;
  }
  return {
    ...filters,
    [chip.key]: current.filter((value) => value !== chip.value),
  };
}

function toggledValue<Value>(
  values: readonly Value[] | undefined,
  value: Value,
): readonly Value[] {
  return (values ?? []).includes(value)
    ? (values ?? []).filter((candidate) => candidate !== value)
    : [...(values ?? []), value];
}

function sectionMatchesQuery(
  item: Pick<LibraryPlanSummary, "name">,
  query: string,
): boolean {
  return item.name.toLocaleLowerCase().includes(
    query.trim().toLocaleLowerCase(),
  );
}

function SegmentedControl({
  section,
  busySection,
  onSelect,
}: Readonly<{
  section: LibrarySection;
  busySection: LibrarySection | null;
  onSelect(section: LibrarySection): void;
}>) {
  const { colors } = useAppTheme();

  return (
    <View
      accessibilityLabel="Library section"
      accessibilityRole="tablist"
      style={[
        styles.segmentedControl,
        { borderColor: colors.divider },
      ]}
    >
      {(["plans", "exercises"] as const).map((option) => {
        const selected = section === option;
        const busy = busySection === option;
        const label = option === "plans" ? "Plans" : "Exercises";
        return (
          <FocusablePressable
            accessibilityLabel={label}
            accessibilityRole="tab"
            accessibilityState={{
              busy,
              disabled: busySection !== null,
              selected,
            }}
            disabled={busySection !== null}
            focusable={busySection === null}
            key={option}
            onPress={() => onSelect(option)}
            style={[
              styles.segment,
              {
                backgroundColor: selected
                  ? colors.action
                  : colors.surface,
              },
            ]}
          >
            <Text
              style={[
                typeScale.bodyStrong as TextStyle,
                {
                  color: selected
                    ? colors.onAction
                    : colors.textPrimary,
                },
              ]}
            >
              {label}
            </Text>
          </FocusablePressable>
        );
      })}
    </View>
  );
}

function SearchField({
  busy,
  section,
  value,
  onChange,
}: Readonly<{
  busy: boolean;
  section: LibrarySection;
  value: string;
  onChange(value: string): void;
}>) {
  const { colors } = useAppTheme();
  const label = section === "plans" ? "Search plans" : "Search exercises";

  return (
    <View style={styles.searchGroup}>
      <Text
        style={[
          typeScale.label as TextStyle,
          { color: colors.textPrimary },
        ]}
      >
        {label}
      </Text>
      <View style={styles.searchControls}>
        <TextInput
          accessibilityLabel={label}
          accessibilityState={{ busy }}
          autoCapitalize="none"
          onChangeText={onChange}
          placeholder={label}
          placeholderTextColor={colors.textSecondary}
          returnKeyType="search"
          style={[
            styles.searchInput,
            typeScale.body as TextStyle,
            {
              backgroundColor: colors.surface,
              borderColor: colors.divider,
              color: colors.textPrimary,
            },
          ]}
          value={value}
        />
        <IconAction
          accessibilityLabel={`Clear ${label.toLocaleLowerCase()}`}
          disabled={value.length === 0}
          icon="clear"
          onPress={() => onChange("")}
        />
      </View>
    </View>
  );
}

function matchesStarterFilters(
  item: LibraryStarterPlanSummary,
  filters: StarterFilters,
): boolean {
  return (
    (filters.goals === undefined || filters.goals.includes(item.goal))
    && (
      filters.experience === undefined
      || filters.experience.includes(item.experience)
    )
    && (
      filters.daysPerWeek === undefined
      || filters.daysPerWeek.includes(item.daysPerWeek)
    )
    && (
      filters.equipment === undefined
      || filters.equipment.some((value) => item.equipment.includes(value))
    )
  );
}

function whyStarterFits(
  item: LibraryStarterPlanSummary,
  filters: StarterFilters,
): string | undefined {
  const reasons = [
    filters.goals?.includes(item.goal) ? `${item.goal} goal` : null,
    filters.experience?.includes(item.experience)
      ? `${item.experience} experience`
      : null,
    filters.daysPerWeek?.includes(item.daysPerWeek)
      ? `${item.daysPerWeek} days per week`
      : null,
    ...(filters.equipment ?? [])
      .filter((value) => item.equipment.includes(value))
      .map((value) => `${value} equipment`),
  ].filter((value): value is string => value !== null);
  return reasons.length === 0 ? undefined : reasons.join(" · ");
}

function PlansContent({
  snapshot,
  query,
  onOpenPlan,
  onOpenStarter,
  onOpenTemplateUpdate,
  selectedId,
  starterFilters,
}: Readonly<{
  snapshot: LibraryBrowseSnapshot;
  query: string;
  onOpenPlan(planId: string): void;
  onOpenStarter(templateId: string): void;
  onOpenTemplateUpdate?(input: Readonly<{
    ownedPlanId: string;
    templateId: string;
  }>): void;
  selectedId: string | null;
  starterFilters: StarterFilters;
}>) {
  const { colors } = useAppTheme();
  const active = snapshot.plans.active !== null
      && sectionMatchesQuery(snapshot.plans.active, query)
    ? snapshot.plans.active
    : null;
  const owned = snapshot.plans.owned.filter((item) =>
    sectionMatchesQuery(item, query)
  );
  const starters = snapshot.plans.starters
    .filter((item) =>
      sectionMatchesQuery(item, query)
      && matchesStarterFilters(item, starterFilters)
    )
    .sort((left, right) =>
      (left.ordinal ?? Number.MAX_SAFE_INTEGER)
      - (right.ordinal ?? Number.MAX_SAFE_INTEGER)
      || left.id.localeCompare(right.id, "en")
    );
  const hasMatches = active !== null
    || owned.length > 0
    || starters.length > 0;

  if (query.trim().length > 0 && !hasMatches) {
    return (
      <InlineNotice
        body="Try another plan name or clear filters."
        heading="No plans match"
      />
    );
  }

  return (
    <>
      <SectionHeader title="Active Plan" />
      {active === null ? (
        <>
          <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>
            No active plan
          </Text>
          <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>
            Choose a starter plan
          </Text>
          <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>
            Review a starter plan or create your own. Nothing is scheduled until you confirm it.
          </Text>
        </>
      ) : (
        <PlanRow
          item={active}
          {...(active.templateUpdateTemplateId === undefined
              || onOpenTemplateUpdate === undefined
            ? {}
            : {
                onOpenTemplateUpdate: () => onOpenTemplateUpdate({
                  ownedPlanId: active.id,
                  templateId: active.templateUpdateTemplateId!,
                }),
              })}
          onPress={() => onOpenPlan(active.id)}
          selected={selectedId === active.id}
        />
      )}
      <SectionHeader title="My Plans" />
      {owned.length === 0 ? (
        <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>
          No personal plans yet
        </Text>
      ) : owned.map((item) => (
        <PlanRow
          item={item}
          key={item.id}
          {...(item.templateUpdateTemplateId === undefined
              || onOpenTemplateUpdate === undefined
            ? {}
            : {
                onOpenTemplateUpdate: () => onOpenTemplateUpdate({
                  ownedPlanId: item.id,
                  templateId: item.templateUpdateTemplateId!,
                }),
              })}
          onPress={() => onOpenPlan(item.id)}
          selected={selectedId === item.id}
        />
      ))}
      <SectionHeader title="Starter Plans" />
      {starters.map((item) => (
        <PlanRow
          item={{
            ...item,
            ...(whyStarterFits(item, starterFilters) === undefined
              ? {}
              : {
                  whyThisFits: whyStarterFits(item, starterFilters)!,
                }),
          }}
          key={item.id}
          onPress={() => onOpenStarter(item.id)}
          selected={selectedId === item.id}
        />
      ))}
    </>
  );
}

function CompactSectionEmpty({ copy }: Readonly<{ copy: string }>) {
  const { colors } = useAppTheme();
  return (
    <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>
      {copy}
    </Text>
  );
}

function exerciseStatusLabels(item: LibraryExerciseItem): readonly string[] {
  return [
    item.availability === "unavailable" ? "Unavailable" : null,
    item.archived ? "Archived" : null,
    item.hidden ? "Hidden" : null,
  ].filter((value): value is string => value !== null);
}

function LibraryExerciseRow({
  item,
  favoriteBusy,
  onFavorite,
  onOpen,
  selected,
}: Readonly<{
  item: LibraryExerciseItem;
  favoriteBusy: boolean;
  onFavorite(): void;
  onOpen(): void;
  selected: boolean;
}>) {
  const { colors } = useAppTheme();
  const statusLabels = exerciseStatusLabels(item);
  const taxonomy = [
    item.exerciseType,
    item.muscles.join(", "),
    item.equipment.join(", "),
  ].filter((value) => value.length > 0).join(" · ");
  const rowLabel = [
    item.canonicalName,
    item.matchedAlias?.label,
    item.originLabel,
    ...statusLabels,
    taxonomy,
    item.favorite ? "Favorite" : "Not favorite",
  ].filter(Boolean).join(". ");
  const favoriteLabel = item.favorite
    ? `Remove ${item.canonicalName} from favorites`
    : `Add ${item.canonicalName} to favorites`;

  return (
    <ContentCard
      selected={selected}
      testID={"library-exercise-card-" + item.exerciseId}
      {...(statusLabels.length > 0 ? { status: "attention" as const } : {})}
    >
      <View style={styles.exerciseCardRow}>
        <FocusablePressable
          accessibilityLabel={rowLabel}
          accessibilityRole="button"
          accessibilityState={{ selected }}
          focusable
          onPress={onOpen}
          style={styles.exerciseRowMain}
        >
          <Text
            style={[
              typeScale.bodyStrong as TextStyle,
              { color: colors.contentCardText },
            ]}
          >
            {item.canonicalName}
          </Text>
          {item.matchedAlias === null ? null : (
            <Text
              style={[
                typeScale.secondary as TextStyle,
                { color: colors.contentCardTextSecondary },
              ]}
            >
              {item.matchedAlias.label}
            </Text>
          )}
          <Text
            style={[
              typeScale.secondary as TextStyle,
              { color: colors.contentCardTextSecondary },
            ]}
          >
            {item.originLabel} · {taxonomy}
          </Text>
          {statusLabels.length === 0 ? null : (
            <Text
              style={[
                typeScale.label as TextStyle,
                { color: colors.contentCardTextSecondary },
              ]}
            >
              {statusLabels.join(" · ")}
            </Text>
          )}
          {item.source === null ? null : (
            <Text
              style={[
                typeScale.secondary as TextStyle,
                { color: colors.contentCardTextSecondary },
              ]}
            >
              {item.source.namespace} · revision {item.source.revision} ·{" "}
              {item.source.license} · {item.source.attribution}
            </Text>
          )}
        </FocusablePressable>
        <ActionCluster style={styles.exerciseActionCluster}>
          <FocusablePressable
            accessibilityLabel={favoriteLabel}
            accessibilityRole="button"
            accessibilityState={{
              busy: favoriteBusy,
              disabled: favoriteBusy,
              selected: item.favorite,
            }}
            disabled={favoriteBusy}
            focusable={!favoriteBusy}
            onPress={onFavorite}
            style={({ pressed }) => [
              styles.exerciseFavoriteAction,
              {
                backgroundColor: pressed
                  ? colors.contentCardPressed
                  : "transparent",
                borderColor: item.favorite
                  ? colors.contentCardStatusCompleted
                  : colors.contentCardBorder,
                opacity: favoriteBusy ? 0.62 : 1,
              },
            ]}
          >
            <Star
              accessibilityElementsHidden
              color={item.favorite
                ? colors.contentCardStatusCompleted
                : colors.contentCardText}
              importantForAccessibility="no-hide-descendants"
              size={sizes.icon}
              strokeWidth={2}
            />
          </FocusablePressable>
        </ActionCluster>
      </View>
    </ContentCard>
  );
}

function ExerciseRows({
  items,
  favoriteBusyIds,
  onFavorite,
  onOpen,
  selectedId,
}: Readonly<{
  items: readonly LibraryExerciseItem[];
  favoriteBusyIds: ReadonlySet<string>;
  onFavorite(item: LibraryExerciseItem): void;
  onOpen(item: LibraryExerciseItem): void;
  selectedId: string | null;
}>) {
  return (
    <>
      {items.map((item) => (
        <LibraryExerciseRow
          favoriteBusy={favoriteBusyIds.has(item.exerciseId)}
          item={item}
          key={item.exerciseId}
          onFavorite={() => onFavorite(item)}
          onOpen={() => onOpen(item)}
          selected={selectedId === item.exerciseId}
        />
      ))}
    </>
  );
}

function ExercisesContent({
  browse,
  favoriteBusyIds,
  hasFilters,
  onFavorite,
  onLoadMore,
  onOpen,
  query,
  onRetry,
  selectedId,
}: Readonly<{
  browse: ExerciseBrowseState;
  favoriteBusyIds: ReadonlySet<string>;
  hasFilters: boolean;
  onFavorite(item: LibraryExerciseItem): void;
  onLoadMore(): void;
  onOpen(item: LibraryExerciseItem): void;
  query: string;
  onRetry(): void;
  selectedId: string | null;
}>) {
  if (browse.loading) {
    return (
      <>
        {Array.from({ length: 8 }, (_, index) => (
          <SkeletonBlock
            height={88}
            key={index}
            testID={`exercise-skeleton-${index + 1}`}
          />
        ))}
      </>
    );
  }
  if (browse.initialError) {
    return (
      <InlineNotice
        action={
          <SecondaryAction
            label="Retry exercise search"
            onPress={onRetry}
          />
        }
        body="Library could not be loaded. Your plans and exercises were not changed. Try again."
        heading="Library could not be loaded"
        tone="error"
      />
    );
  }

  const searchMode = query.trim().length > 0 || hasFilters;
  if (searchMode) {
    return (
      <>
        <SectionHeader title="Results" />
        {browse.items.length === 0 ? (
          <InlineNotice
            body="Try another name or alias, or clear filters to see all available exercises."
            heading="No exercises match"
          />
        ) : (
          <ExerciseRows
            favoriteBusyIds={favoriteBusyIds}
            items={browse.items}
            onFavorite={onFavorite}
            onOpen={onOpen}
            selectedId={selectedId}
          />
        )}
        {browse.pageError ? (
          <InlineNotice
            action={
              <SecondaryAction
                label="Retry loading more exercises"
                onPress={onLoadMore}
              />
            }
            body="More exercises could not be loaded. Your current results and filters are unchanged."
            heading="More exercises could not be loaded"
            tone="error"
          />
        ) : browse.nextCursor === null ? null : (
          <PrimaryAction
            busy={browse.loadingMore}
            label="Load more exercises"
            onPress={onLoadMore}
          />
        )}
      </>
    );
  }

  return (
    <>
      <SectionHeader title="Favorites" />
      {browse.favorites.length === 0 ? (
        <CompactSectionEmpty copy="No favorites yet" />
      ) : (
        <ExerciseRows
          favoriteBusyIds={favoriteBusyIds}
          items={browse.favorites}
          onFavorite={onFavorite}
          onOpen={onOpen}
          selectedId={selectedId}
        />
      )}
      <SectionHeader title="Recent" />
      {browse.recent.length === 0 ? (
        <CompactSectionEmpty copy="No recent exercises yet" />
      ) : (
        <ExerciseRows
          favoriteBusyIds={favoriteBusyIds}
          items={browse.recent}
          onFavorite={onFavorite}
          onOpen={onOpen}
          selectedId={selectedId}
        />
      )}
      <SectionHeader title="All Exercises" />
      <ExerciseRows
        favoriteBusyIds={favoriteBusyIds}
        items={browse.items}
        onFavorite={onFavorite}
        onOpen={onOpen}
        selectedId={selectedId}
      />
      {browse.pageError ? (
        <InlineNotice
          action={
            <SecondaryAction
              label="Retry loading more exercises"
              onPress={onLoadMore}
            />
          }
          body="More exercises could not be loaded. Your current results and filters are unchanged."
          heading="More exercises could not be loaded"
          tone="error"
        />
      ) : browse.nextCursor === null ? null : (
        <PrimaryAction
          busy={browse.loadingMore}
          label="Load more exercises"
          onPress={onLoadMore}
        />
      )}
    </>
  );
}

function FilterSheet({
  options,
  visible,
  selectedFilters,
  onApply,
  onClose,
}: Readonly<{
  options: Readonly<{
    exerciseTypes: readonly string[];
    muscles: readonly string[];
    equipment: readonly string[];
  }>;
  visible: boolean;
  selectedFilters: SearchFilters;
  onApply(filters: SearchFilters): void;
  onClose(): void;
}>) {
  const { colors } = useAppTheme();
  const [draft, setDraft] = useState<SearchFilters>(selectedFilters);
  const headingRef = useRef<View>(null);

  useEffect(() => {
    if (visible) {
      setDraft(selectedFilters);
      headingRef.current?.focus();
    }
  }, [selectedFilters, visible]);

  const optionRows = [
    ...options.exerciseTypes.map((value) => ({
      group: "Exercise type",
      selected: draft.exerciseTypes?.includes(value) ?? false,
      toggle: () => setDraft((current) => ({
        ...current,
        exerciseTypes: toggledValue(current.exerciseTypes, value),
      })),
      value,
    })),
    ...options.muscles.map((value) => ({
      group: "Muscle",
      selected: draft.muscles?.includes(value) ?? false,
      toggle: () => setDraft((current) => ({
        ...current,
        muscles: toggledValue(current.muscles, value),
      })),
      value,
    })),
    ...options.equipment.map((value) => ({
      group: "Equipment",
      selected: draft.equipment?.includes(value) ?? false,
      toggle: () => setDraft((current) => ({
        ...current,
        equipment: toggledValue(current.equipment, value),
      })),
      value,
    })),
    ...(["bundled", "custom", "copied"] as const).map((value) => ({
      group: "Origin",
      selected: draft.origins?.includes(value) ?? false,
      toggle: () => setDraft((current) => ({
        ...current,
        origins: toggledValue(current.origins, value),
      })),
      value,
    })),
    ...(["available", "unavailable", "hidden", "archived"] as const).map(
      (value) => ({
        group: "Visibility",
        selected: draft.visibility?.includes(value) ?? false,
        toggle: () => setDraft((current) => ({
          ...current,
          visibility: toggledValue(current.visibility, value),
        })),
        value,
      }),
    ),
    {
      group: "Recent use",
      selected: draft.recent?.includes(true) ?? false,
      toggle: () => setDraft((current) => ({
        ...current,
        recent: toggledValue(current.recent, true),
      })),
      value: "Recent",
    },
    {
      group: "Favorite status",
      selected: draft.favorite?.includes(true) ?? false,
      toggle: () => setDraft((current) => ({
        ...current,
        favorite: toggledValue(current.favorite, true),
      })),
      value: "Favorite",
    },
  ];
  return (
    <Modal
      animationType="none"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.modalBackdrop}>
        <ScrollView
          accessibilityViewIsModal
          contentContainerStyle={styles.filterSheetContent}
          keyboardShouldPersistTaps="handled"
          style={[styles.filterSheet, { backgroundColor: colors.surface }]}
          testID="library-filter-sheet"
        >
          <View
            accessibilityRole="header"
            accessible
            focusable
            ref={headingRef}
          >
            <Text
              style={[
                typeScale.screenTitle as TextStyle,
                { color: colors.textPrimary },
              ]}
            >
              Exercise filters
            </Text>
          </View>
          <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>
            Select any value within a category. Categories combine together.
          </Text>
          {optionRows.map((option) => (
            <FocusablePressable
              accessibilityLabel={`${option.group}: ${
                displayFilterValue(String(option.value))
              }`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: option.selected }}
              focusable
              key={`${option.group}:${String(option.value)}`}
              onPress={option.toggle}
              style={[
                styles.checkbox,
                { borderColor: colors.divider },
              ]}
            >
              <Text style={[
                typeScale.body as TextStyle,
                { color: colors.textPrimary },
              ]}>
                {option.group} · {displayFilterValue(String(option.value))}
              </Text>
            </FocusablePressable>
          ))}
          <PrimaryAction
            label="Show results"
            onPress={() => onApply(draft)}
          />
          <SecondaryAction label="Cancel" onPress={onClose} />
        </ScrollView>
      </View>
    </Modal>
  );
}

function StarterFilterSheet({
  starters,
  visible,
  selectedFilters,
  onApply,
  onClose,
}: Readonly<{
  starters: readonly LibraryStarterPlanSummary[];
  visible: boolean;
  selectedFilters: StarterFilters;
  onApply(filters: StarterFilters): void;
  onClose(): void;
}>) {
  const { colors } = useAppTheme();
  const [draft, setDraft] = useState<StarterFilters>(selectedFilters);
  const headingRef = useRef<View>(null);

  useEffect(() => {
    if (visible) {
      setDraft(selectedFilters);
      headingRef.current?.focus();
    }
  }, [selectedFilters, visible]);

  const unique = <Value,>(values: readonly Value[]): readonly Value[] =>
    [...new Set(values)];
  const optionRows = [
    ...unique(starters.map(({ goal }) => goal)).map((value) => ({
      group: "Goal",
      label: value,
      selected: draft.goals?.includes(value) ?? false,
      toggle: () => setDraft((current) => ({
        ...current,
        goals: toggledValue(current.goals, value),
      })),
    })),
    ...unique(starters.map(({ experience }) => experience)).map((value) => ({
      group: "Experience",
      label: value,
      selected: draft.experience?.includes(value) ?? false,
      toggle: () => setDraft((current) => ({
        ...current,
        experience: toggledValue(current.experience, value),
      })),
    })),
    ...[...unique(starters.map(({ daysPerWeek }) => daysPerWeek))]
      .sort((left, right) => left - right)
      .map((value) => ({
        group: "Days per week",
        label: String(value),
        selected: draft.daysPerWeek?.includes(value) ?? false,
        toggle: () => setDraft((current) => ({
          ...current,
          daysPerWeek: toggledValue(current.daysPerWeek, value),
        })),
      })),
    ...[...unique(starters.flatMap(({ equipment }) => equipment))]
      .sort((left, right) => left.localeCompare(right, "en"))
      .map((value) => ({
        group: "Equipment",
        label: value,
        selected: draft.equipment?.includes(value) ?? false,
        toggle: () => setDraft((current) => ({
          ...current,
          equipment: toggledValue(current.equipment, value),
        })),
      })),
  ];

  return (
    <Modal
      animationType="none"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.modalBackdrop}>
        <ScrollView
          accessibilityViewIsModal
          contentContainerStyle={styles.filterSheetContent}
          keyboardShouldPersistTaps="handled"
          style={[styles.filterSheet, { backgroundColor: colors.surface }]}
          testID="starter-filter-sheet"
        >
          <View
            accessibilityRole="header"
            accessible
            focusable
            ref={headingRef}
          >
            <Text style={[
              typeScale.screenTitle as TextStyle,
              { color: colors.textPrimary },
            ]}>
              Starter filters
            </Text>
          </View>
          <Text style={[
            typeScale.body as TextStyle,
            { color: colors.textSecondary },
          ]}>
            Values within one category combine with OR. Categories combine with AND.
          </Text>
          {optionRows.map((option) => (
            <FocusablePressable
              accessibilityLabel={`${option.group}: ${option.label}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: option.selected }}
              focusable
              key={`${option.group}:${option.label}`}
              onPress={option.toggle}
              style={[
                styles.checkbox,
                { borderColor: colors.divider },
              ]}
            >
              <Text style={[
                typeScale.body as TextStyle,
                { color: colors.textPrimary },
              ]}>
                {option.group} · {option.label}
              </Text>
            </FocusablePressable>
          ))}
          <PrimaryAction
            label="Show results"
            onPress={() => onApply(draft)}
          />
          <SecondaryAction label="Cancel" onPress={onClose} />
        </ScrollView>
      </View>
    </Modal>
  );
}

export function LibraryScreen({
  contentUpdateFailed,
  contentUpdateResult,
  loadLibrary,
  refreshLibrary = loadLibrary,
  listRecentExercises,
  onCreateExercise,
  onCreatePlan,
  onOpenExercise,
  onOpenPlan,
  onOpenStarter = onOpenPlan,
  onOpenTemplateUpdate,
  onReviewChanges,
  searchExercises,
  setExerciseFavorite,
  setSection,
  width,
}: LibraryScreenProps) {
  const [snapshot, setSnapshot] = useState<LibraryBrowseSnapshot | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadRetrying, setLoadRetrying] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [processState, setProcessState] = useState(initialProcessState);
  const [exerciseBrowse, setExerciseBrowse] = useState<ExerciseBrowseState>(
    initialExerciseBrowseState,
  );
  const [favoriteBusyIds, setFavoriteBusyIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [dismissedUpdateKeys, setDismissedUpdateKeys] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [reviewedUpdate, setReviewedUpdate] =
    useState<ContentUpdateResult | null>(null);
  const [busySection, setBusySection] = useState<LibrarySection | null>(null);
  const [filterVisible, setFilterVisible] = useState(false);
  const [starterFilters, setStarterFilters] = useState<StarterFilters>({});
  const filterActionRef = useRef<View>(null);
  const reviewActionRef = useRef<View>(null);
  const reviewHeadingRef = useRef<View>(null);
  const scrollOffsetsRef = useRef<Record<LibrarySection, number>>({
    plans: 0,
    exercises: 0,
  });
  const mountedRef = useRef(true);
  const loadGenerationRef = useRef(0);
  const loadRetryInFlightRef = useRef(false);
  const searchGenerationRef = useRef(0);
  const refreshInFlightRef = useRef(false);
  const { colors } = useAppTheme();
  const section = snapshot?.sectionPreference.section ?? "plans";
  const activeState = processState[section];

  useEffect(() => {
    if (reviewedUpdate !== null) {
      reviewHeadingRef.current?.focus();
    }
  }, [reviewedUpdate]);

  useEffect(() => {
    mountedRef.current = true;
    const generation = loadGenerationRef.current + 1;
    loadGenerationRef.current = generation;
    loadRetryInFlightRef.current = false;
    setLoadRetrying(false);
    void loadLibrary().then((value) => {
      if (mountedRef.current && generation === loadGenerationRef.current) {
        setSnapshot(value);
        setLoadFailed(false);
      }
    }).catch(() => {
      if (mountedRef.current && generation === loadGenerationRef.current) {
        setLoadFailed(true);
      }
    });
    return () => {
      mountedRef.current = false;
    };
  }, [loadLibrary]);

  useEffect(() => {
    if (snapshot?.sectionPreference.section !== "exercises") {
      return;
    }
    const generation = searchGenerationRef.current + 1;
    searchGenerationRef.current = generation;
    setExerciseBrowse((current) => ({
      ...current,
      loading: true,
      initialError: false,
      pageError: false,
    }));
    const timer = setTimeout(() => {
      void Promise.all([
        searchExercises({
          query: processState.exercises.query,
          filters: processState.exercises.filters,
          cursor: null,
        }),
        listRecentExercises(),
        searchExercises({
          query: "",
          filters: { favorite: [true] },
          cursor: null,
        }),
      ]).then(([result, recent, favoriteResult]) => {
        if (
          !mountedRef.current
          || generation !== searchGenerationRef.current
        ) {
          return;
        }
        if (result.state === "restart") {
          setExerciseBrowse({
            ...initialExerciseBrowseState,
            loading: false,
            initialError: true,
          });
          return;
        }
        setExerciseBrowse({
          favorites: favoriteResult.state === "page"
            ? favoriteResult.items.filter(({ favorite }) => favorite)
            : [],
          items: result.items,
          recent: recent.slice(0, 10),
          nextCursor: result.nextCursor,
          loading: false,
          loadingMore: false,
          initialError: false,
          pageError: false,
        });
      }).catch(() => {
        if (
          mountedRef.current
          && generation === searchGenerationRef.current
        ) {
          setExerciseBrowse((current) => ({
            ...current,
            loading: false,
            loadingMore: false,
            initialError: true,
          }));
        }
      });
    }, 120);
    return () => clearTimeout(timer);
  }, [
    listRecentExercises,
    processState.exercises.filters,
    processState.exercises.query,
    searchExercises,
    snapshot?.sectionPreference.section,
  ]);

  function loadMoreExercises() {
    const cursor = exerciseBrowse.nextCursor;
    if (cursor === null || exerciseBrowse.loadingMore) {
      return;
    }
    setExerciseBrowse((current) => ({
      ...current,
      loadingMore: true,
      pageError: false,
    }));
    const generation = searchGenerationRef.current;
    void searchExercises({
      query: processState.exercises.query,
      filters: processState.exercises.filters,
      cursor,
    }).then((result) => {
      if (
        !mountedRef.current
        || generation !== searchGenerationRef.current
      ) {
        return;
      }
      if (result.state === "restart") {
        setExerciseBrowse((current) => ({
          ...current,
          loadingMore: false,
          pageError: true,
        }));
        return;
      }
      setExerciseBrowse((current) => {
        const existing = new Set(
          current.items.map(({ exerciseId }) => exerciseId),
        );
        return {
          ...current,
          items: [
            ...current.items,
            ...result.items.filter(({ exerciseId }) =>
              !existing.has(exerciseId)
            ),
          ],
          nextCursor: result.nextCursor,
          loadingMore: false,
          pageError: false,
        };
      });
    }).catch(() => {
      if (
        mountedRef.current
        && generation === searchGenerationRef.current
      ) {
        setExerciseBrowse((current) => ({
          ...current,
          loadingMore: false,
          pageError: true,
        }));
      }
    });
  }

  function toggleFavorite(item: LibraryExerciseItem) {
    if (favoriteBusyIds.has(item.exerciseId)) {
      return;
    }
    setFavoriteBusyIds((current) =>
      new Set([...current, item.exerciseId])
    );
    void setExerciseFavorite(item.exerciseId, !item.favorite).then((result) => {
      if (!mountedRef.current) {
        return;
      }
      const apply = (candidate: LibraryExerciseItem): LibraryExerciseItem =>
        candidate.exerciseId === result.exerciseId
          ? { ...candidate, favorite: result.favorite }
          : candidate;
      setExerciseBrowse((current) => ({
        ...current,
        favorites: result.favorite
          ? current.favorites.some(({ exerciseId }) =>
              exerciseId === result.exerciseId
            )
            ? current.favorites.map(apply)
            : [
                ...current.favorites,
                apply(item),
              ].sort((left, right) =>
                left.canonicalName.localeCompare(right.canonicalName, "en")
                || left.exerciseId.localeCompare(right.exerciseId, "en")
              )
          : current.favorites.filter(({ exerciseId }) =>
              exerciseId !== result.exerciseId
            ),
        items: current.items.map(apply),
        recent: current.recent.map(apply),
      }));
    }).finally(() => {
      if (mountedRef.current) {
        setFavoriteBusyIds((current) => {
          const next = new Set(current);
          next.delete(item.exerciseId);
          return next;
        });
      }
    });
  }

  function requestLibraryRefresh() {
    if (snapshot === null || refreshInFlightRef.current) {
      return;
    }
    refreshInFlightRef.current = true;
    setRefreshing(true);
    setRefreshFailed(false);
    void refreshLibrary().then((value) => {
      if (mountedRef.current) {
        setSnapshot((current) => {
          if (current === null) {
            return value;
          }
          const sectionPreference =
            current.sectionPreference.revision >= value.sectionPreference.revision
              ? current.sectionPreference
              : value.sectionPreference;
          return { ...value, sectionPreference };
        });
      }
    }).catch(() => {
      if (mountedRef.current) {
        setRefreshFailed(true);
      }
    }).finally(() => {
      refreshInFlightRef.current = false;
      if (mountedRef.current) {
        setRefreshing(false);
      }
    });
  }

  function retryInitialLoad() {
    if (loadRetryInFlightRef.current) {
      return;
    }
    const generation = loadGenerationRef.current + 1;
    loadGenerationRef.current = generation;
    loadRetryInFlightRef.current = true;
    setLoadRetrying(true);
    void loadLibrary().then((value) => {
      if (mountedRef.current && generation === loadGenerationRef.current) {
        setSnapshot(value);
        setLoadFailed(false);
      }
    }).catch(() => {
      if (mountedRef.current && generation === loadGenerationRef.current) {
        setLoadFailed(true);
      }
    }).finally(() => {
      if (generation === loadGenerationRef.current) {
        loadRetryInFlightRef.current = false;
        if (mountedRef.current) {
          setLoadRetrying(false);
        }
      }
    });
  }

  function updateSectionState(
    target: LibrarySection,
    update: Partial<SectionProcessState>,
  ) {
    setProcessState((current) => ({
      ...current,
      [target]: {
        ...current[target],
        ...update,
      },
    }));
  }

  function selectSection(nextSection: LibrarySection) {
    if (
      snapshot === null
      || nextSection === snapshot.sectionPreference.section
      || busySection !== null
    ) {
      return;
    }
    setBusySection(nextSection);
    void setSection(nextSection, snapshot.sectionPreference.revision)
      .then((preference) => {
        if (mountedRef.current) {
          setSnapshot((current) =>
            current === null
              ? current
              : { ...current, sectionPreference: preference }
          );
        }
      })
      .finally(() => {
        if (mountedRef.current) {
          setBusySection(null);
        }
      });
  }

  const selectedCount = section === "plans"
    ? starterFilterCount(starterFilters)
    : filterCount(activeState.filters);
  const selectedChips = section === "exercises"
    ? filterChips(activeState.filters)
    : [];
  const updateKey = contentUpdateResult === undefined
    ? null
    : `${contentUpdateResult.revision}:${contentUpdateResult.packSha256}`;
  const showContentUpdate = contentUpdateResult !== undefined
    && (
      contentUpdateResult.added > 0
      || contentUpdateResult.updated > 0
      || contentUpdateResult.newlyUnavailable > 0
    )
    && updateKey !== null
    && !dismissedUpdateKeys.has(updateKey);
  const headerAction = section === "plans"
    ? (
        <PrimaryAction
          label="Create my own"
          onPress={onCreatePlan}
        />
      )
    : (
        <PrimaryAction
          label="Create custom exercise"
          onPress={onCreateExercise}
        />
      );

  return (
    <>
      <AdaptiveScreen
        primary={
          <>
            <ScreenHeader action={headerAction} title="Library" />
            <SegmentedControl
              busySection={busySection}
              onSelect={selectSection}
              section={section}
            />
            <SearchField
              busy={section === "exercises" && exerciseBrowse.loading}
              onChange={(query) => updateSectionState(section, { query })}
              section={section}
              value={activeState.query}
            />
            {showContentUpdate ? (
              <InlineNotice
                action={
                  <View style={styles.noticeActions}>
                    <SecondaryAction
                      label="Review changes"
                      onPress={() => {
                        setReviewedUpdate(contentUpdateResult);
                        onReviewChanges?.(contentUpdateResult);
                      }}
                      ref={reviewActionRef}
                    />
                    <SecondaryAction
                      label="Dismiss exercise library update"
                      onPress={() => {
                        setDismissedUpdateKeys((current) =>
                          new Set([...current, updateKey])
                        );
                      }}
                    />
                  </View>
                }
                body={`${contentUpdateResult.added} added · ${contentUpdateResult.updated} updated · ${contentUpdateResult.newlyUnavailable} unavailable`}
                heading="Exercise library updated"
                tone="completed"
              />
            ) : null}
            {contentUpdateFailed ? (
              <InlineNotice
                body="Exercise content could not be updated. The previous library is still available."
                heading="Exercise content could not be updated"
                tone="error"
              />
            ) : null}
            <View style={styles.filterBar}>
              <SecondaryAction
                accessibilityHint="Values within one category combine with OR; categories combine with AND."
                label="Filter"
                onPress={() => setFilterVisible(true)}
                ref={filterActionRef}
              />
              <Text>
                {selectedCount === 0
                  ? "No filters selected"
                  : `${selectedCount} filter selected`}
              </Text>
              {selectedCount === 0 ? null : (
                <SecondaryAction
                  label="Clear filters"
                  onPress={() => {
                    if (section === "plans") {
                      setStarterFilters({});
                    } else {
                      updateSectionState(section, { filters: {} });
                    }
                  }}
                />
              )}
              {snapshot === null ? null : (
                <SecondaryAction
                  busy={refreshing}
                  label="Refresh Library"
                  onPress={requestLibraryRefresh}
                />
              )}
            </View>
            {!refreshFailed ? null : (
              <InlineNotice
                action={
                  <SecondaryAction
                    label="Retry Library refresh"
                    onPress={requestLibraryRefresh}
                  />
                }
                body="Library could not be refreshed. Your current content, selection, search, and filters are unchanged."
                heading="Library refresh failed"
                tone="error"
              />
            )}
            {selectedChips.map((chip) => (
              <SecondaryAction
                accessibilityHint="Removes this selected filter."
                key={`${chip.key}:${String(chip.value)}`}
                label={`Remove ${chip.label}`}
                onPress={() => updateSectionState(section, {
                  filters: removeFilterChip(activeState.filters, chip),
                })}
              />
            ))}
            {loadFailed ? (
              <InlineNotice
                action={
                  <SecondaryAction
                    busy={loadRetrying}
                    label="Retry Library"
                    onPress={retryInitialLoad}
                  />
                }
                body="Library could not be loaded. Your plans and exercises were not changed. Try again."
                heading="Library could not be loaded"
                tone="error"
              />
            ) : snapshot === null ? (
              <>
                {Array.from({ length: 6 }, (_, index) => (
                  <SkeletonBlock
                    height={72}
                    key={index}
                    testID={`library-skeleton-${index + 1}`}
                  />
                ))}
              </>
            ) : section === "plans" ? (
              <PlansContent
                onOpenPlan={(planId) => {
                  updateSectionState("plans", { selectedId: planId });
                  onOpenPlan(planId);
                }}
                onOpenStarter={(templateId) => {
                  updateSectionState("plans", { selectedId: templateId });
                  onOpenStarter(templateId);
                }}
                {...(onOpenTemplateUpdate === undefined
                  ? {}
                  : { onOpenTemplateUpdate })}
                query={processState.plans.query}
                snapshot={snapshot}
                selectedId={processState.plans.selectedId}
                starterFilters={starterFilters}
              />
            ) : (
              <ExercisesContent
                browse={exerciseBrowse}
                favoriteBusyIds={favoriteBusyIds}
                hasFilters={selectedCount > 0}
                onFavorite={toggleFavorite}
                onLoadMore={loadMoreExercises}
                onOpen={(item) => {
                  updateSectionState("exercises", {
                    selectedId: item.exerciseId,
                  });
                  onOpenExercise(item.exerciseId);
                }}
                onRetry={() => {
                  searchGenerationRef.current += 1;
                  setExerciseBrowse(initialExerciseBrowseState);
                  updateSectionState("exercises", {
                    filters: { ...processState.exercises.filters },
                  });
                }}
                query={processState.exercises.query}
                selectedId={processState.exercises.selectedId}
              />
            )}
          </>
        }
        onScroll={(event) => {
          scrollOffsetsRef.current[section] = libraryScrollOffset(event);
        }}
        scrollOffset={scrollOffsetsRef.current[section]}
        scrollRestoreKey={section}
        testID="library-screen"
        {...(width === undefined ? {} : { width })}
      />
      {section === "plans" ? (
        <StarterFilterSheet
          onApply={(filters) => {
            setStarterFilters(filters);
            setFilterVisible(false);
            filterActionRef.current?.focus();
          }}
          onClose={() => {
            setFilterVisible(false);
            filterActionRef.current?.focus();
          }}
          selectedFilters={starterFilters}
          starters={snapshot?.plans.starters ?? []}
          visible={filterVisible}
        />
      ) : (
        <FilterSheet
          options={snapshot?.exerciseFilterOptions ?? {
            exerciseTypes: [],
            muscles: [],
            equipment: ["barbell"],
          }}
          onApply={(equipment) => {
            updateSectionState(section, {
              filters: equipment,
            });
            setFilterVisible(false);
            filterActionRef.current?.focus();
          }}
          onClose={() => {
            setFilterVisible(false);
            filterActionRef.current?.focus();
          }}
          selectedFilters={activeState.filters}
          visible={filterVisible}
        />
      )}
      <Modal
        animationType="none"
        onRequestClose={() => {
          setReviewedUpdate(null);
          reviewActionRef.current?.focus();
        }}
        transparent
        visible={reviewedUpdate !== null}
      >
        <View style={styles.modalBackdrop}>
          <ScrollView
            accessibilityViewIsModal
            contentContainerStyle={styles.filterSheetContent}
            keyboardShouldPersistTaps="handled"
            style={[styles.filterSheet, { backgroundColor: colors.surface }]}
            testID="library-update-sheet"
          >
            <View
              accessibilityRole="header"
              accessible
              focusable
              ref={reviewHeadingRef}
            >
              <Text>Exercise library changes</Text>
            </View>
            <Text>
              {reviewedUpdate === null
                ? ""
                : `${reviewedUpdate.added} added · ${reviewedUpdate.updated} updated · ${reviewedUpdate.newlyUnavailable} unavailable`}
            </Text>
            <Text>
              Custom exercises, copied plans, existing plan references, and historical snapshots are unchanged.
            </Text>
            <SecondaryAction
              label="Close changes"
              onPress={() => {
                setReviewedUpdate(null);
                reviewActionRef.current?.focus();
              }}
            />
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

export function libraryScrollOffset(
  event: NativeSyntheticEvent<NativeScrollEvent>,
): number {
  return event.nativeEvent.contentOffset.y;
}

const styles = StyleSheet.create({
  segmentedControl: {
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    overflow: "hidden",
  },
  segment: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    minHeight: sizes.minimumTarget,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  searchGroup: {
    gap: space[1],
  },
  searchControls: {
    alignItems: "center",
    flexDirection: "row",
    gap: space[2],
  },
  searchInput: {
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    minHeight: sizes.minimumTarget,
    minWidth: 0,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  filterBar: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
  },
  noticeActions: {
    alignItems: "stretch",
    gap: space[2],
    marginTop: space[2],
  },
  row: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: space[1],
    minHeight: sizes.minimumTarget,
    paddingVertical: space[2],
  },
  exerciseCardRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: space[2],
  },
  exerciseRowMain: {
    flex: 1,
    gap: space[1],
    minHeight: sizes.minimumTarget,
    minWidth: 0,
  },
  exerciseActionCluster: {
    alignSelf: "stretch",
  },
  exerciseFavoriteAction: {
    alignItems: "center",
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: sizes.minimumTarget,
    minWidth: sizes.minimumTarget,
  },
  modalBackdrop: {
    backgroundColor: "rgba(0, 0, 0, 0.48)",
    flex: 1,
    justifyContent: "flex-end",
  },
  filterSheet: {
    maxHeight: "90%",
  },
  filterSheetContent: {
    gap: space[4],
    padding: space[6],
  },
  checkbox: {
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: sizes.minimumTarget,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
});
