export interface Repository { server: string; directory: string }
export const repositoryKey = (repository: Repository) => JSON.stringify([repository.server, repository.directory])
