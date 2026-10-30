# Development commands

## Phase 18 Python coverage

Create or update the repository-local virtual environment from the checked-in exact dependency pin:

```sh
npm run bootstrap:coverage:phase18
```

Run the Python coverage evidence only after that explicit bootstrap step:

```sh
npm run test:coverage:phase18:python
```

The evidence command uses `.venv/bin/python` and never installs packages. A missing environment or any `coverage.py` version other than the version in `requirements-dev.lock` fails closed without writing a passed report.
