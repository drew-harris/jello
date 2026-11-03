import { strict as assert } from "node:assert"
import { test } from "node:test"
import { RepositoryEvents, repositoryKey } from "./repository"

const repository = { server: "remote", directory: "/large/repo" }

test("repository events coalesce tags and isolate servers, directories, and subscriptions", async () => {
  const events = new RepositoryEvents()
  let history = 0
  let bookmarks = 0
  let other = 0
  const unsubscribe = events.subscribe(repository, ["history", "bookmarks"], () => history++)
  events.subscribe(repository, ["bookmarks"], () => bookmarks++)
  events.subscribe({ ...repository, server: "other" }, ["history"], () => other++)
  events.subscribe({ ...repository, directory: "/elsewhere" }, ["history"], () => other++)
  events.invalidate(repository, ["history"])
  events.invalidate(repository, ["history", "bookmarks"])
  assert.equal(history, 0)
  await Promise.resolve()
  assert.deepEqual([history, bookmarks, other], [1, 1, 0])
  unsubscribe()
  events.invalidate(repository, ["history"])
  await Promise.resolve()
  assert.deepEqual([history, bookmarks, other], [1, 1, 0])
})

test("invalidation during notification is delivered in a separate batch", async () => {
  const events = new RepositoryEvents()
  let calls = 0
  events.subscribe(repository, ["history"], () => {
    if (++calls === 1) events.invalidate(repository, ["history"])
  })
  events.invalidate(repository, ["history"])
  await Promise.resolve()
  assert.equal(calls, 1)
  await Promise.resolve()
  assert.equal(calls, 2)
  assert.notEqual(repositoryKey({ server: "a:b", directory: "c" }), repositoryKey({ server: "a", directory: "b:c" }))
})

test("repeated unsubscribe cannot detach newer subscribers", async () => {
  const events = new RepositoryEvents()
  const unsubscribe = events.subscribe(repository, ["history"], () => {})
  unsubscribe()
  let calls = 0
  events.subscribe(repository, ["history"], () => calls++)
  unsubscribe()
  events.invalidate(repository, ["history"])
  await Promise.resolve()
  assert.equal(calls, 1)
})
