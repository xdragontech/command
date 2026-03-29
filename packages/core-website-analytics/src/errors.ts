export class WebsiteAnalyticsValidationError extends Error {
  status = 422;

  constructor(message: string) {
    super(message);
    this.name = "WebsiteAnalyticsValidationError";
  }
}
