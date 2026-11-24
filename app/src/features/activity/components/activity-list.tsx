import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Button, Label, PressableFeedback, Typography, useThemeColor } from 'heroui-native';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { FreshnessBanner } from '@/components/freshness-banner';
import { LoadError, LoadingRows, MorePagesFooter } from '@/components/query-states';
import { useHeaderShadowOnScroll } from '@/components/use-header-shadow-on-scroll';
import { useApartment, useMembers } from '@/features/apartments/hooks';
import { useCurrentUserId } from '@/features/auth/session-provider';
import { useDisplayNames } from '@/features/profile/hooks';
import { userErrorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/time';

import {
  ACTIVITY_GROUPS,
  type ActivityEntry,
  type ActivityFilter,
  type ActivityGroup,
  NO_ACTIVITY_FILTER,
} from '../api';
import { activityHref, describeActivity } from '../describe';
import { useActivity } from '../hooks';

const EVERYTHING = 'all';
const ANYONE = 'anyone';

/**
 * The apartment's timeline (FR-10.8): who added, changed, disputed, paid and
 * settled what, newest first. Each person sees only entries about records
 * they may read; tapping one opens its record.
 */
export function ActivityList({ apartmentId }: { apartmentId: string }) {
  const userId = useCurrentUserId();
  const apartment = useApartment(apartmentId);
  const members = useMembers(apartmentId);
  const [filter, setFilter] = useState<ActivityFilter>(NO_ACTIVITY_FILTER);
  const activity = useActivity(apartmentId, filter);
  const [refreshing, setRefreshing] = useState(false);
  const headerShadow = useHeaderShadowOnScroll();

  const entries = useMemo(() => activity.data?.pages.flat() ?? [], [activity.data]);
  const memberNames = useMemo(
    () => new Map(members.data?.map((member) => [member.userId, member.displayName])),
    [members.data],
  );
  // People named in entries who were never members, such as someone who asked to join.
  const otherIds = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of entries) {
      for (const id of [entry.actorId, entry.personId, entry.counterpartyId]) {
        if (id && !memberNames.has(id)) ids.add(id);
      }
    }
    return [...ids].sort();
  }, [entries, memberNames]);
  const otherNames = useDisplayNames(otherIds);

  const nameOf = (id: string): string => {
    if (id === userId) return 'You';
    if (memberNames.has(id)) return memberNames.get(id) ?? 'Unnamed member';
    return otherNames.data?.[id] ?? 'Someone';
  };
  const isAdmin = members.data?.some(
    (member) => member.userId === userId && member.leftAt === null && member.role === 'admin',
  );
  const people = (members.data ?? []).filter((member) => member.hiddenAt === null);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([activity.refetch(), members.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

  const loadMore = () => {
    if (activity.hasNextPage && !activity.isFetchingNextPage && !activity.isFetchNextPageError) {
      void activity.fetchNextPage();
    }
  };

  const isFiltered = filter.group !== null || filter.actorId !== null;

  return (
    <FlatList
      {...headerShadow}
      className="flex-1 bg-background"
      contentContainerClassName="gap-2 px-5 pb-8 pt-4"
      data={entries}
      keyExtractor={(entry) => String(entry.id)}
      renderItem={({ item }) => (
        <ActivityRow
          entry={item}
          text={describeActivity(item, {
            currency: apartment.data?.currency ?? 'PKR',
            nameOf,
          })}
          onPress={(() => {
            const href = activityHref(item, apartmentId, { userId, isAdmin: isAdmin ?? false });
            return href ? () => router.push(href) : undefined;
          })()}
        />
      )}
      ListHeaderComponent={
        <View className="gap-4 pb-2">
          <FreshnessBanner freshness={activity} />
          <View className="gap-2">
            <Label>Show</Label>
            <ChoiceChips
              accessibilityLabel="Show"
              choices={[{ value: EVERYTHING, label: 'Everything' }, ...ACTIVITY_GROUPS]}
              selected={filter.group ?? EVERYTHING}
              onSelect={(value) =>
                setFilter((current) => ({
                  ...current,
                  group: value === EVERYTHING ? null : (value as ActivityGroup),
                }))
              }
            />
          </View>
          {people.length > 1 ? (
            <View className="gap-2">
              <Label>Done by</Label>
              <ChoiceChips
                accessibilityLabel="Done by"
                choices={[
                  { value: ANYONE, label: 'Anyone' },
                  ...people.map((member) => ({
                    value: member.userId,
                    label: nameOf(member.userId),
                  })),
                ]}
                selected={filter.actorId ?? ANYONE}
                onSelect={(value) =>
                  setFilter((current) => ({ ...current, actorId: value === ANYONE ? null : value }))
                }
              />
            </View>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        activity.isPending ? (
          <LoadingRows count={4} />
        ) : activity.isLoadingError ? (
          <LoadError
            message={userErrorMessage(activity.error, 'Could not load the activity.')}
            onRetry={() => void activity.refetch()}
          />
        ) : isFiltered ? (
          <View className="items-center gap-3 py-10">
            <Typography.Paragraph color="muted" className="text-center">
              Nothing matches these filters.
            </Typography.Paragraph>
            <Button size="sm" variant="secondary" onPress={() => setFilter(NO_ACTIVITY_FILTER)}>
              Show everything
            </Button>
          </View>
        ) : (
          <Typography.Paragraph color="muted" className="py-10 text-center">
            Nothing has happened here yet.
          </Typography.Paragraph>
        )
      }
      ListFooterComponent={<MorePagesFooter pages={activity} noun="activity" />}
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    />
  );
}

function ActivityRow({
  entry,
  text,
  onPress,
}: {
  entry: ActivityEntry;
  text: string;
  /** Missing when the entry has no screen to open. */
  onPress?: () => void;
}) {
  const muted = useThemeColor('muted');
  const when = formatDateTime(new Date(entry.createdAt));
  const body = (
    <View className="flex-row items-center gap-3 rounded-2xl bg-surface px-4 py-3">
      <View className="flex-1 gap-1">
        <Typography.Paragraph type="body-sm">{text}</Typography.Paragraph>
        <Typography.Paragraph type="body-xs" color="muted">
          {when}
        </Typography.Paragraph>
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={18} color={muted} /> : null}
    </View>
  );
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={`${text}, ${when}`}>
        {body}
      </View>
    );
  }
  return (
    <PressableFeedback
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${text}, ${when}`}
      accessibilityHint="Opens it"
      className="rounded-2xl"
    >
      {body}
    </PressableFeedback>
  );
}
