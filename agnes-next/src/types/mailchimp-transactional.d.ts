declare module '@mailchimp/mailchimp_transactional' {
  function mailchimp(apiKey: string): {
    messages: {
      send: (payload: { message: unknown }) => Promise<unknown>;
    };
  };
  export default mailchimp;
}
