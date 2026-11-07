export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export const illegalTransition = (from: string, action: string) =>
  new DomainError('illegal_transition', `A commitment that is ${from.replace('_', ' ')} cannot be ${action}.`);

export const notAllowed = (who: string, action: string) =>
  new DomainError('not_allowed', `Only the ${who} team can ${action}.`);

export const staleVersion = () =>
  new DomainError('stale_version', 'Someone else changed this commitment a moment ago. Reload and try again.');

export const notFound = (what: string) => new DomainError('not_found', `${what} was not found.`);

export const invalid = (message: string) => new DomainError('invalid', message);
