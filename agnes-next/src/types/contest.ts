export type Associate = {
  id: string;
  firstName: string;
  lastName?: string;
  email: string;
  social?: {
    x?: string;
    instagram?: string;
    tiktok?: string;
    truth?: string;
  };
  code: string;
  createdAt: string;
};

export type SignupPayload = {
  firstName: string;
  lastName?: string;
  email: string;
  x?: string;
  instagram?: string;
  tiktok?: string;
};

