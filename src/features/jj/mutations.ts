import type { MountedSession } from "@opencode/plugin/gui"
import type { Repository } from "../../shared/repository"
import type { WindowQueries } from "../../shared/gui/query"
import { jjQueryKey } from "./queries"
import { Status } from "./rpc"

// One policy for every JJ write, independent of which menu/dialog invoked it.
// Mutation success does not wait for slow background refreshes to finish.
export function createJJMutations(queries: WindowQueries, repository: Repository, client: MountedSession["server"]["client"]) {
  const rpc = client.rpc(Status)
  const directory = repository.directory
  const run = <T>(work: () => Promise<T>) => queries.client.getMutationCache().build<T, unknown, void, unknown>(queries.client, {
    mutationKey: jjQueryKey(repository), mutationFn: work,
    onSuccess: () => queries.invalidate(jjQueryKey(repository)),
  }).execute()
  return {
    commit: (message: string) => run(() => rpc.commit({ directory, message })),
    abandon: (commitID: string) => run(() => rpc.abandon({ directory, commitID })),
    describe: (commitID: string, message: string) => run(() => rpc.describe({ directory, commitID, message })),
    edit: (commitID: string) => run(() => rpc.edit({ directory, commitID })),
    setBookmark: (commitID: string, name: string) => run(() => rpc.setBookmark({ directory, commitID, name })),
    gitPush: (commitID: string) => run(() => rpc.gitPush({ directory, commitID })),
    squashBelow: (commitID: string, parentID: string, message?: string) => run(() => rpc.squashBelow({ directory, commitID, parentID, ...(message !== undefined ? { message } : {}) })),
    newChange: (commitID?: string) => run(() => rpc.newChange({ directory, ...(commitID ? { commitID } : {}) })),
  }
}
