# Canapé : tests, paquet Debian, dépôt APT.
.PHONY: test deb apt clean

# Tests du serveur (node:test)
test:
	npm test

# Construit dist/canape_<version>_all.deb avec SHA256SUMS et lintian
deb:
	scripts/build-deb.sh

# Publie dist/*.deb dans le dépôt APT signé (branche gh-pages)
apt:
	scripts/publier-apt.sh dist/*.deb

clean:
	rm -rf dist build debian/canape debian/.debhelper debian/.npm-cache debian/files debian/*.substvars debian/*.debhelper debian/*.debhelper.log debian/debhelper-build-stamp
