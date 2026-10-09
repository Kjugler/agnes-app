'use client';

import { openPrivacyChoices } from '@/lib/privacy/advertisingConsentClient';

type PrivacyChoicesTriggerProps = {
  color: string;
};

export default function PrivacyChoicesTrigger({ color }: PrivacyChoicesTriggerProps) {
  return (
    <button
      type="button"
      onClick={() => openPrivacyChoices()}
      style={{
        color,
        background: 'none',
        border: 'none',
        padding: 0,
        font: 'inherit',
        textDecoration: 'underline',
        cursor: 'pointer',
      }}
    >
      Privacy Choices
    </button>
  );
}
