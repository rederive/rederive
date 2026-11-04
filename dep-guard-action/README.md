# dep-guard has moved

The dependency-add PR gate now lives in its own repository, so it can be listed on the GitHub Marketplace and pinned
on its own release line: **https://github.com/rederive/dep-guard**

```yaml
- uses: rederive/dep-guard@v1
```

The last in-tree copy is on tags `v0.5.0`–`v0.5.3` of this repo (`rederive/rederive/dep-guard-action@v0.5.3` still
resolves). The verdict it renders is `rdv guard`, which stays here in the `rederive` CLI.
