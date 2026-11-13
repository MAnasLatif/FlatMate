import { router } from 'expo-router';
import {
  Button,
  Card,
  Chip,
  Label,
  Separator,
  TextArea,
  TextField,
  Typography,
} from 'heroui-native';
import { type ReactNode, useState } from 'react';
import { Alert, View } from 'react-native';

import { FormAlert } from '@/components/form/form-alert';
import { PhotoPicker } from '@/components/photo-picker';
import { PrivateImageThumbnail } from '@/components/private-image';
import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import type { Apartment, Member } from '@/features/apartments/api';
import { useApartment, useMembers } from '@/features/apartments/hooks';
import { useCurrentUserId } from '@/features/auth/session-provider';
import { memberLabel } from '@/features/expenses/member-label';
import { userErrorMessage } from '@/lib/errors';
import { formatMinorUnits } from '@/lib/money';
import type { PickedImage } from '@/lib/private-images';
import { formatDate, lastDayBefore } from '@/lib/time';

import type { PaymentDetail } from '../api';
import { PAYMENT_ERROR_MESSAGES, proofUploadErrorMessage } from '../errors';
import { usePaymentDetail, usePaymentMutations } from '../hooks';
import { paymentPermissions, paymentStatus } from '../rules';

/** One payment: who paid whom, its status, proof, objections and what the viewer can do (SRS FR-07.8). */
export function PaymentDetailView({
  apartmentId,
  paymentId,
}: {
  apartmentId: string;
  paymentId: string;
}) {
  const detail = usePaymentDetail(apartmentId, paymentId);
  const apartment = useApartment(apartmentId);
  const members = useMembers(apartmentId);

  if (detail.isPending || apartment.isPending || members.isPending) {
    return (
      <Screen padTop={false}>
        <LoadingRows count={3} />
      </Screen>
    );
  }
  const loadError = detail.error ?? apartment.error ?? members.error;
  if (loadError || !apartment.data || !members.data) {
    return (
      <Screen padTop={false}>
        <LoadError
          message={userErrorMessage(loadError, 'Could not load this payment.')}
          onRetry={() => {
            void detail.refetch();
            void apartment.refetch();
            void members.refetch();
          }}
        />
      </Screen>
    );
  }
  if (!detail.data) {
    return (
      <Screen padTop={false}>
        <FormAlert status="warning" message={PAYMENT_ERROR_MESSAGES.payment_not_found} />
        <Button variant="secondary" onPress={() => router.back()}>
          Go back
        </Button>
      </Screen>
    );
  }

  return (
    <PaymentContent
      apartment={apartment.data}
      detail={detail.data}
      members={members.data}
      refreshing={detail.isRefetching}
      onRefresh={() => void detail.refetch()}
    />
  );
}

function PaymentContent({
  apartment,
  detail,
  members,
  refreshing,
  onRefresh,
}: {
  apartment: Apartment;
  detail: PaymentDetail;
  members: Member[];
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const userId = useCurrentUserId();
  const { payment, objections, proofs } = detail;
  const mutations = usePaymentMutations(apartment.id);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [proof, setProof] = useState<PickedImage | null>(null);

  const money = (amountMinor: number) => `${formatMinorUnits(amountMinor)} ${payment.currency}`;
  const nameOf = (id: string) => {
    const member = members.find((item) => item.userId === id);
    return member ? memberLabel(member, userId) : 'A former member';
  };
  const status = paymentStatus(payment.status);
  const openObjection = objections.find((objection) => objection.state === 'open');
  const permissions = paymentPermissions(payment, userId, openObjection);
  const recipient = payment.recipientId === userId ? 'you' : nameOf(payment.recipientId);
  const actionError =
    mutations.decline.error ?? mutations.withdrawDecline.error ?? mutations.void.error;
  const isBusy =
    mutations.decline.isPending || mutations.withdrawDecline.isPending || mutations.void.isPending;

  const decline = () => {
    const text = reason.trim();
    if (text === '') {
      setReasonError('Say why you decline it, for example that nothing arrived.');
      return;
    }
    setReasonError(null);
    mutations.decline.mutate(
      { paymentId: payment.id, reason: text },
      { onSuccess: () => setReason('') },
    );
  };
  const confirmVoid = () =>
    Alert.alert(
      'Void this payment?',
      'It stops counting as paid. It stays in the history, and this cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Void', style: 'destructive', onPress: () => mutations.void.mutate(payment.id) },
      ],
    );

  return (
    <Screen padTop={false} refreshing={refreshing} onRefresh={onRefresh}>
      <Card>
        <Card.Body className="gap-2">
          <Typography.Paragraph type="body-sm" color="muted">
            {nameOf(payment.payerId)} paid {recipient}
          </Typography.Paragraph>
          <Typography.Heading type="h3">{money(payment.amountMinor)}</Typography.Heading>
          <View className="flex-row">
            <Chip size="sm" variant="soft" color={status.color}>
              {status.label}
            </Chip>
          </View>
          <Typography.Paragraph type="body-sm" color="muted">
            {status.explanation}
          </Typography.Paragraph>
          {payment.status === 'provisional' ? (
            <Typography.Paragraph type="body-sm">
              {payment.recipientId === userId ? 'You' : nameOf(payment.recipientId)} can object
              until the end of{' '}
              {formatDate(lastDayBefore(payment.finalizeAfter, apartment.timezone))}.
            </Typography.Paragraph>
          ) : null}
          <Separator />
          <Detail label="Paid on" value={formatDate(payment.paidAt)} />
          <Detail label="Recorded on" value={formatDate(payment.createdAt)} />
          {payment.reference ? <Detail label="Reference" value={payment.reference} /> : null}
        </Card.Body>
      </Card>

      {permissions.canDecline || permissions.canWithdrawDecline || permissions.canVoid ? (
        <Card>
          <Card.Body className="gap-3">
            <FormAlert
              message={
                reasonError ??
                (actionError
                  ? userErrorMessage(
                      actionError,
                      'Could not save that. Please try again.',
                      PAYMENT_ERROR_MESSAGES,
                    )
                  : null)
              }
            />
            {permissions.canDecline ? (
              <>
                <Typography.Paragraph type="body-sm">
                  If the money did not arrive, decline the payment. Until it is sorted out it does
                  not count as paid.
                </Typography.Paragraph>
                <TextField isInvalid={reasonError !== null}>
                  <Label>Why are you declining it?</Label>
                  <TextArea
                    value={reason}
                    onChangeText={setReason}
                    accessibilityLabel="Why you decline the payment"
                  />
                </TextField>
                <Button variant="danger-soft" onPress={decline} isDisabled={isBusy}>
                  Decline payment
                </Button>
              </>
            ) : null}
            {permissions.canWithdrawDecline && openObjection ? (
              <Button
                variant="secondary"
                onPress={() => mutations.withdrawDecline.mutate(openObjection.id)}
                isDisabled={isBusy}
              >
                The money arrived: withdraw my objection
              </Button>
            ) : null}
            {permissions.canVoid ? (
              <Button variant="ghost" onPress={confirmVoid} isDisabled={isBusy}>
                Void this payment
              </Button>
            ) : null}
          </Card.Body>
        </Card>
      ) : null}

      <Section title="Proof">
        {proofs.length === 0 ? (
          <Typography.Paragraph type="body-sm" color="muted">
            No proof attached.
          </Typography.Paragraph>
        ) : (
          <View className="flex-row flex-wrap gap-2">
            {proofs.map((item, index) => (
              <PrivateImageThumbnail
                key={item.id}
                bucket="payment-proofs"
                path={item.storagePath}
                label={`Open proof ${index + 1}`}
                onPress={() =>
                  router.push({
                    pathname: '/apartments/[apartmentId]/photo',
                    params: {
                      apartmentId: apartment.id,
                      bucket: 'payment-proofs',
                      path: item.storagePath,
                    },
                  })
                }
              />
            ))}
          </View>
        )}
        {permissions.canAddProof ? (
          <View className="gap-2">
            <PhotoPicker
              title="Add proof"
              description="A screenshot of the transfer. It is your claim, not a bank confirmation, and cannot be removed."
              attachLabel="Choose photo"
              image={proof}
              onChange={setProof}
              isDisabled={mutations.addProof.isPending}
            />
            <FormAlert
              message={
                mutations.addProof.error ? proofUploadErrorMessage(mutations.addProof.error) : null
              }
            />
            {proof ? (
              <Button
                isDisabled={mutations.addProof.isPending}
                onPress={() =>
                  mutations.addProof.mutate(
                    { paymentId: payment.id, image: proof },
                    { onSuccess: () => setProof(null) },
                  )
                }
              >
                {mutations.addProof.isPending ? 'Uploading…' : 'Attach proof'}
              </Button>
            ) : null}
          </View>
        ) : null}
      </Section>

      {objections.length > 0 ? (
        <Section title="Objections">
          {objections.map((objection) => (
            <View key={objection.id} className="gap-0.5">
              <Typography.Paragraph type="body-sm">
                {nameOf(objection.raisedBy)} declined it
                {objection.isLate ? ' after the deadline, so it stayed confirmed' : ''}: “
                {objection.reason}”
              </Typography.Paragraph>
              <Typography.Paragraph type="body-xs" color="muted">
                {formatDate(objection.createdAt)}
                {objection.state === 'resolved'
                  ? objection.resolution === 'withdrawn'
                    ? ' · withdrawn'
                    : ' · the payment was voided'
                  : ' · open'}
              </Typography.Paragraph>
            </View>
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-3">
      <Typography.Paragraph type="body-sm" color="muted">
        {label}
      </Typography.Paragraph>
      <Typography.Paragraph type="body-sm" className="flex-1 text-right">
        {value}
      </Typography.Paragraph>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <Card.Body className="gap-3">
        <Card.Title>{title}</Card.Title>
        <Separator />
        {children}
      </Card.Body>
    </Card>
  );
}
