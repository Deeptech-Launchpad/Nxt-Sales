import Companies from './Companies'

// Recents — companies with the newest activity (created OR edited) first.
//
// Deliberately renders the Companies list itself rather than a parallel
// implementation: same columns, same filters, same row rendering, same
// Company Detail navigation. Only the ordering (sort=recent on the API) and
// the heading differ, so the two can never drift apart, and no duplicate
// company records exist anywhere — this is purely a different view over the
// same rows.
export default function Recents() {
  return <Companies recentsMode />
}
