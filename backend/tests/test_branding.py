"""Logo institucional cargado desde Configuración."""
import base64

from frente_b_support import api  # noqa: F401  (fixture)

PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)


def test_branding_is_public_and_empty_by_default(api):
    res = api.client.get("/api/branding")
    assert res.status_code == 200
    assert res.json() == {"logo": "", "version": ""}


def test_admin_uploads_replaces_and_removes_the_logo(api):
    res = api.client.put("/api/config/branding", headers=api.headers("superadmin"), files={"file": ("logo.png", PNG, "image/png")})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["logo"].startswith("data:image/png;base64,") and body["version"]
    assert api.client.get("/api/branding").json() == body

    res = api.client.delete("/api/config/branding", headers=api.headers("superadmin"))
    assert res.status_code == 200 and res.json() == {"logo": "", "version": ""}


def test_rejects_other_formats_and_big_files(api):
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    res = api.client.put("/api/config/branding", headers=api.headers("superadmin"), files={"file": ("logo.svg", svg, "image/svg+xml")})
    assert res.status_code == 422 and "PNG" in res.json()["detail"]
    # El tipo declarado no cuenta: se mira la firma del archivo.
    res = api.client.put("/api/config/branding", headers=api.headers("superadmin"), files={"file": ("logo.png", svg, "image/png")})
    assert res.status_code == 422
    big = PNG + b"0" * (400 * 1024)
    res = api.client.put("/api/config/branding", headers=api.headers("superadmin"), files={"file": ("logo.png", big, "image/png")})
    assert res.status_code == 422 and "400 KB" in res.json()["detail"]


def test_only_config_managers_can_change_it(api):
    res = api.client.put("/api/config/branding", files={"file": ("logo.png", PNG, "image/png")})
    assert res.status_code in (401, 403)
