# Deployment note - 832402226_calculator_frontend

This client is a zero-build static site: the `src/` directory is served as-is.

**The full deployment procedure lives in the back-end repository**, in
`DEPLOYMENT.md` and `deploy/sync-frontend.ps1`. Read it there.

Summary of how the pair is published:

1. `832402226_calculator_backend` is deployed to a free cloud host (Render)
   together with a copy of this `src/` directory, vendored into the back end as
   `src/web`. The back end then serves both the page and the `/api/...`
   endpoints from one origin, so the browser issues no cross origin request.
2. Because the two copies would drift apart, `deploy/sync-frontend.ps1` in the
   back-end repository refreshes that vendored copy. Run it after every front-end
   change, then commit and push the back-end repository.

Running the two projects locally is described in `README.md` section 7.