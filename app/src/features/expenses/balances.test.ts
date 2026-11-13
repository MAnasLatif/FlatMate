import type { Balance } from './api';
import { summarizeBalances } from './balances';

function balance(overrides: Partial<Balance>): Balance {
  return {
    counterpartyId: 'someone',
    finalMinor: 0,
    provisionalMinor: 0,
    disputedMinor: 0,
    ...overrides,
  };
}

describe('summarizeBalances', () => {
  it('is all zero with nobody to settle with', () => {
    expect(summarizeBalances([])).toEqual({
      oweMinor: 0,
      receiveMinor: 0,
      netMinor: 0,
      oweIsProvisional: false,
      receiveIsProvisional: false,
      heldOweMinor: 0,
      heldReceiveMinor: 0,
    });
  });

  it('shows the payer of Rs 200 cleaning what two flatmates owe them (SRS 5.1)', () => {
    const summary = summarizeBalances([
      balance({ counterpartyId: 'zubair', provisionalMinor: -6667 }),
      balance({ counterpartyId: 'ajmal', provisionalMinor: -6666 }),
    ]);
    expect(summary.receiveMinor).toBe(13_333);
    expect(summary.oweMinor).toBe(0);
    expect(summary.netMinor).toBe(13_333);
    expect(summary.receiveIsProvisional).toBe(true);
  });

  it('nets each person on their own and never across people', () => {
    const summary = summarizeBalances([
      balance({ counterpartyId: 'zubair', finalMinor: 5000 }),
      balance({ counterpartyId: 'ajmal', finalMinor: -3000 }),
    ]);
    expect(summary.oweMinor).toBe(5000);
    expect(summary.receiveMinor).toBe(3000);
    expect(summary.netMinor).toBe(-2000);
    expect(summary.oweIsProvisional).toBe(false);
  });

  it('adds provisional to final for the same person and flags the result', () => {
    const summary = summarizeBalances([balance({ finalMinor: 10_000, provisionalMinor: -3000 })]);
    expect(summary.oweMinor).toBe(7000);
    expect(summary.oweIsProvisional).toBe(true);
    expect(summary.receiveIsProvisional).toBe(false);
  });

  it('leaves a person who is square out of both figures', () => {
    const summary = summarizeBalances([balance({ finalMinor: 4000, provisionalMinor: -4000 })]);
    expect(summary.oweMinor).toBe(0);
    expect(summary.receiveMinor).toBe(0);
    expect(summary.oweIsProvisional).toBe(false);
  });

  it('holds disputed amounts out of what is payable', () => {
    const summary = summarizeBalances([
      balance({ counterpartyId: 'zubair', finalMinor: 2000, disputedMinor: 9000 }),
      balance({ counterpartyId: 'ajmal', disputedMinor: -1500 }),
    ]);
    expect(summary.oweMinor).toBe(2000);
    expect(summary.receiveMinor).toBe(0);
    expect(summary.heldOweMinor).toBe(9000);
    expect(summary.heldReceiveMinor).toBe(1500);
    expect(summary.netMinor).toBe(-2000);
  });
});
