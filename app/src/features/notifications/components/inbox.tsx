import { router } from 'expo-router';
import { Button, Card, PressableFeedback, Spinner, Typography } from 'heroui-native';
import { useMemo } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

import { FreshnessBanner } from '@/components/freshness-banner';
import { OnlineButton } from '@/components/online-button';
import { LoadError, LoadingRows } from '@/components/query-states';
import { userErrorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/time';

import type { NotificationItem } from '../api';
import { describeNotification, notificationHref } from '../describe';
import { useMarkRead, useNotifications } from '../hooks';

/** The signed-in user's notifications, newest first (SRS FR-09). */
export function Inbox({ userId }: { userId: string }) {
  const notifications = useNotifications(userId);
  const markRead = useMarkRead(userId);
  const items = useMemo(() => notifications.data?.pages.flat() ?? [], [notifications.data]);
  const hasUnread = items.some((item) => item.readAt === null);

  const open = (item: NotificationItem) => {
    if (item.readAt === null) markRead.mutate([item.id]);
    router.push(notificationHref(item));
  };

  return (
    <FlatList
      className="flex-1 bg-background"
      contentContainerClassName="gap-3 px-5 pb-8 pt-4"
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <NotificationRow item={item} onPress={() => open(item)} />}
      ListHeaderComponent={
        <View className="gap-3 pb-1">
          <FreshnessBanner freshness={notifications} />
          {hasUnread ? (
            <OnlineButton
              variant="secondary"
              onPress={() => markRead.mutate(undefined)}
              isDisabled={markRead.isPending}
            >
              Mark all as read
            </OnlineButton>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        notifications.isPending ? (
          <LoadingRows count={4} />
        ) : notifications.isLoadingError ? (
          <LoadError
            message={userErrorMessage(notifications.error, 'Could not load your notifications.')}
            onRetry={() => void notifications.refetch()}
          />
        ) : (
          <View className="items-center gap-2 py-10">
            <Typography.Heading type="h6" className="text-center">
              No notifications yet
            </Typography.Heading>
            <Typography.Paragraph type="body-sm" color="muted" className="text-center">
              You will hear here when a flatmate adds an expense with you, records a payment or
              raises a dispute.
            </Typography.Paragraph>
          </View>
        )
      }
      ListFooterComponent={
        notifications.isFetchingNextPage ? (
          <Spinner accessibilityLabel="Loading more notifications" className="self-center" />
        ) : notifications.isFetchNextPageError ? (
          <Button variant="secondary" onPress={() => void notifications.fetchNextPage()}>
            Could not load more. Try again
          </Button>
        ) : undefined
      }
      onEndReached={() => {
        if (notifications.hasNextPage && !notifications.isFetchingNextPage) {
          void notifications.fetchNextPage();
        }
      }}
      onEndReachedThreshold={0.5}
      refreshControl={
        <RefreshControl
          refreshing={notifications.isRefetching && !notifications.isFetchingNextPage}
          onRefresh={() => void notifications.refetch()}
        />
      }
    />
  );
}

function NotificationRow({ item, onPress }: { item: NotificationItem; onPress: () => void }) {
  const unread = item.readAt === null;
  const text = describeNotification(item);
  return (
    <PressableFeedback
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${unread ? 'Unread. ' : ''}${text}`}
    >
      <Card>
        <Card.Body className="flex-row gap-3">
          <View
            className={unread ? 'mt-2 size-2 rounded-full bg-accent' : 'mt-2 size-2'}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <View className="flex-1 gap-1">
            {item.apartmentName ? (
              <Typography.Paragraph type="body-xs" color="muted">
                {item.apartmentName}
              </Typography.Paragraph>
            ) : null}
            <Typography.Paragraph>{text}</Typography.Paragraph>
            <Typography.Paragraph type="body-xs" color="muted">
              {formatDateTime(Date.parse(item.createdAt))}
            </Typography.Paragraph>
          </View>
        </Card.Body>
      </Card>
    </PressableFeedback>
  );
}
