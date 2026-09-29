import { describe, expect, it } from 'vitest';

import { purchaseErrorDetails, purchaseErrorProps } from '../error-details';

describe('purchaseErrorDetails', () => {
  it('reads a RevenueCat PurchasesError', () => {
    const details = purchaseErrorDetails('offerings', {
      code: '2',
      message: 'There was a problem with the App Store.',
      readableErrorCode: 'OLD_FIELD',
      userInfo: { readableErrorCode: 'STORE_PROBLEM' },
      underlyingErrorMessage: 'SKErrorDomain 0',
    });
    expect(details).toEqual({
      stage: 'offerings',
      rcCode: '2',
      readableErrorCode: 'STORE_PROBLEM',
      underlyingErrorMessage: 'SKErrorDomain 0',
      message: 'There was a problem with the App Store.',
    });
  });

  it('falls back to the deprecated top-level readableErrorCode', () => {
    expect(purchaseErrorDetails('purchase', { readableErrorCode: 'NETWORK_ERROR' }).readableErrorCode).toBe(
      'NETWORK_ERROR',
    );
  });

  it('keeps only the stage when there is no error object', () => {
    expect(purchaseErrorDetails('no_package')).toEqual({ stage: 'no_package' });
  });

  it('records a string as the message and truncates long text', () => {
    expect(purchaseErrorDetails('paywall_result', 'ERROR').message).toBe('ERROR');
    const long = purchaseErrorDetails('present', new Error('x'.repeat(500))).message!;
    expect(long.length).toBeLessThanOrEqual(201);
  });
});

describe('purchaseErrorProps', () => {
  it('flattens to snake_case analytics props', () => {
    expect(purchaseErrorProps({ stage: 'offerings', rcCode: '10', readableErrorCode: 'NETWORK_ERROR' })).toEqual({
      error_stage: 'offerings',
      rc_error_code: '10',
      rc_readable_error_code: 'NETWORK_ERROR',
      rc_underlying_error_message: undefined,
      error_message: undefined,
    });
  });

  it('is empty without details', () => {
    expect(purchaseErrorProps(undefined)).toEqual({});
  });
});
