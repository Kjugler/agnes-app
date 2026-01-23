declare module "@mailchimp/mailchimp_transactional" {
  type MailchimpTransactionalClient = any;

  export default function mailchimpTransactional(apiKey: string): MailchimpTransactionalClient;
}
