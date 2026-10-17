"""Standard-library only, no network code, synthetic fixtures."""
import ast
import hashlib
import re
import sys

from conftest import ALL_INVENTORIES, FIXTURES, ROOT, load

PKG = ROOT / "privacy_inventory"
NETWORK_MODULES = {"socket", "urllib", "http", "requests", "ftplib", "smtplib", "ssl", "asyncio"}


def imported_modules():
    for path in PKG.glob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for a in node.names:
                    yield path.name, a.name.split(".")[0]
            elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                yield path.name, node.module.split(".")[0]


def test_package_is_standard_library_only_and_has_no_network_imports():
    for fname, mod in imported_modules():
        assert mod in sys.stdlib_module_names or mod == "privacy_inventory", (fname, mod)
        assert mod not in NETWORK_MODULES, (fname, mod)


def test_fixtures_are_marked_synthetic():
    for path in list(ALL_INVENTORIES) + [FIXTURES / "records.synthetic.json"]:
        assert ".synthetic." in path.name
        assert load(path)["synthetic"] is True


# sha256 of lower-cased words that must not appear in fixtures or docs (faith-specific
# vocabulary from the source pages). Stored hashed so this test does not copy them either.
_DENY = {
    "26b9a38d26c84a60e820736f30977f1a6790c252e8f97d132ce68e1d67401ac3",
    "db7599b667c23049e974c1d3b3c077e87f18e5b2dd50a92f300783502c6dfff5",
    "7a8fb51d361681c172738ea73a402d7835f9d5dba2daa585762e747494550c09",
    "91e3a9026f03e0bf3fe0c9d130738cb3efad7535ccc05b7e83be9c4ef8b08755",
    "fd3e57b64514acab7f7c5ca80c7f199e7e153752ad9941ea6a0fac99a470475d",
    "64a0377aaaa910f39fe3b80aa4635340ed6d901433a4c132f519f5263c93179a",
    "a0a4f725f71e6a2f716476d44dbf631e6d07cf0c90cb8d080ce8a6951c979d2d",
    "8dd6962134f260c154be0aed7cd58431aef4106b815110bb73ffebd779992af8",
    "ff737a5f71410365e48c52ba5d3b1f584896105fdb512b601f89600bef4930ea",
    "d4dfcfa42a631aa375810c7474183e1b06418f735aaa7a44062a39071d633594",
    "2c3cc00e836a1819dc9fc9996604d68e0b4a35a47a9ce5d0dfa096776d2057e9",
    "0f650398311405ce02629c7c7fdfb35ae2e9f8b4e598b0a29310b9806f769168",
}


def _word_hashes(text):
    return {hashlib.sha256(w.encode()).hexdigest() for w in re.findall(r"[a-z]+", text.lower())}


def test_no_denylisted_vocabulary_in_fixtures_or_readme():
    texts = [p.read_text(encoding="utf-8") for p in FIXTURES.glob("*.json")]
    texts.append((ROOT / "README.md").read_text(encoding="utf-8"))
    for t in texts:
        assert not (_word_hashes(t) & _DENY)
