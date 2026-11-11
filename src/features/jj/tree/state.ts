import { keepPreviousData, useQuery } from "@tanstack/solid-query"
import type { MountedSession } from "@opencode/plugin/gui"
import type { Accessor } from "solid-js"
import type { Repository } from "../../../shared/repository"
import type { WindowQueries } from "../../../shared/gui/query"
import { historyQuery, positionsQuery } from "../queries"

export function createHistoryQueries(queries: WindowQueries, repository: Repository,
  client: Accessor<MountedSession["server"]["client"]>, limit: Accessor<number>, enabled: Accessor<boolean>) {
  const history = useQuery(() => ({ ...historyQuery(queries.client, repository, client(), limit()),
    enabled: enabled(), placeholderData: keepPreviousData }), () => queries.client)
  const positions = useQuery(() => ({ ...positionsQuery(queries.client, repository, client()), enabled: enabled() }), () => queries.client)
  return {
    history, positions,
    refresh() {
      void history.refetch({ cancelRefetch: false })
      void positions.refetch({ cancelRefetch: false })
    },
  }
}
