# TextGraph for Markdown Preview

**Write the flow. See the diagram.**

Turn a few lines in your Markdown into a diagram people can follow, right beside your text in VS Code.

[Install TextGraph](https://marketplace.visualstudio.com/items?itemName=drawmotive.textgraph-markdown) · [Try this diagram](https://textgraph.dev/playground?d=0.c2hvcHBpbmcoaW5mbyk6IFNob3BwaW5nIHsKICBicm93c2UgLT4gY2hlY2tvdXQKfQoKcHJvY2Vzc2luZyhwcmltYXJ5KTogQmVoaW5kIHRoZSBzY2VuZXMgewogIHBheW1lbnQgLT4gc2F2ZWQgOiBZZXMKICBwYXltZW50IC0-KGRhc2hlZCB3YXJuaW5nKSByZXRyeSA6IE5vCiAgcmV0cnkgLT4oZGFzaGVkIHdhcm5pbmcpIHBheW1lbnQKICBzYXZlZCAtPiBlbWFpbAp9CgpkZWxpdmVyeShzdWNjZXNzKTogRGVsaXZlcnkgewogIHBhY2sgLT4gc2hpcCAtPiBhcnJpdmVkCn0KCmNoZWNrb3V0IC0-IHBheW1lbnQKc2F2ZWQgLT4gcGFjawoKYnJvd3NlOiBCcm93c2UgdGhlIHNob3AKY2hlY2tvdXQ6IFBsYWNlIGFuIG9yZGVyCnBheW1lbnQoZGlhbW9uZCBmaWxsIHByaW1hcnkpOiBQYXltZW50XG5hY2NlcHRlZD8KcmV0cnkod2FybmluZyk6IFRyeSBhbm90aGVyXG5wYXltZW50CnNhdmVkOiBTYXZlIHRoZSBvcmRlcgplbWFpbDogU2VuZCBjb25maXJtYXRpb25cbmVtYWlsCnBhY2s6IFByZXBhcmUgdGhlIHBhY2thZ2UKc2hpcDogU2hpcCB0aGUgcGFja2FnZQphcnJpdmVkKGVsbGlwc2UgZmlsbCBzdWNjZXNzKTogUGFja2FnZSBhcnJpdmVzCg) · [Open the example Markdown](examples/online-order.md)

![TextGraph source beside its rendered online-order diagram: Shopping, Behind the scenes, and Delivery, including a payment decision, a retry loop, and a confirmation email.](media/online-order-demo.png)

## Try it with your own words

1. Install **TextGraph for Markdown Preview** and open [online-order.md](examples/online-order.md) in a trusted workspace.
2. Run **Markdown: Open Preview to the Side** (`Ctrl+K V`, or `Cmd+K V` on macOS).
3. Change **Package arrives** to **Delivered**. The diagram updates as you type, including unsaved edits.

Your diagram stays with your documentation as readable text.

<!-- public-preview:start -->

````markdown
```textgraph
shopping(info): Shopping {
  browse -> checkout
}

processing(primary): Behind the scenes {
  payment -> saved : Yes
  payment ->(dashed warning) retry : No
  retry ->(dashed warning) payment
  saved -> email
}

delivery(success): Delivery {
  pack -> ship -> arrived
}

checkout -> payment
saved -> pack

browse: Browse the shop
checkout: Place an order
payment(diamond fill primary): Payment\naccepted?
retry(warning): Try another\npayment
saved: Save the order
email: Send confirmation\nemail
pack: Prepare the package
ship: Ship the package
arrived(ellipse fill success): Package arrives
```
````

![Online order: shopping, a payment decision and retry, confirmation, and delivery.](media/online-order.png)

[Open the full diagram](media/online-order.png) · [Copy the source](examples/online-order.textgraph) · [Try this diagram](https://textgraph.dev/playground?d=1.eJxtkcFqwzAQRO_6ij3ah_yADimEnksgvRRy2UqbaIm9EivHwZT-e5GlJAR6MlppZmeec4gpsZw7llPsLRzaGX4MwLfGWybYbMEFcpd4ncyvMUmjo5yLKCmPqEtvYUeBxcMUCLIjobwaJFxGkqk4ZJzJg4Uvyi8XncccyMMNVVjOPShNuoCFj2igHf551QwMNOPNFmhEHkpATwPPpEuXr64k7S28t1FL5S5rpMCpfFGVZ_JFeu9ZxvcVjwVFZ0yFYmFX4ayNQ0wPqYX9gI4ABaJ6UtN8Os84RvFw4mGAJ7l9vT4KOkdpIv9m1tbdvauFT10AJU6B9CgvsSwccK4h6rIVgoUDiQcX5cQ64sRRjlLxlA4W9koJterKBM9kCo3y_zm9jBucjoaBU6aa_gl2X581htn8AYyRzTM)

<!-- public-preview:end -->

For Chinese, Japanese, and color emoji, see the [packaged font examples](https://github.com/drawmotive/textgraph/tree/main/language-packs#language-coverage).

Connections inside a group introduce its local nodes and may style endpoints
inline. Keep standalone node labels or styles at the root, in any order.
Root short names find a node when its name is unique. The same name in two
groups creates two nodes: `Review { done }` and `Delivery { done }` need
`Review.done` or `Delivery.done` when referenced at the root. Short names
inside each group are local. Group names follow the same rule, and nested
names can use a unique suffix such as `Backend.payment`. Qualified
connection endpoints refer to existing objects without changing containment.

[Example with repeated node names](examples/repeated-names.textgraph)

Renders locally, without an account or API key. Requires VS Code 1.101 or newer and a trusted workspace; the first preview takes a few seconds to initialize.

Want to move shapes and edit on a canvas? Try the downloadable editable example in [DrawMotive for VS Code](https://github.com/drawmotive/vscode-drawmotive). This Markdown extension previews TextGraph; it does not transfer a source block into the visual editor.

[Report an issue](https://github.com/drawmotive/textgraph/issues) · [Development and support](docs/development.md) · [Project](https://github.com/drawmotive/markdown-textgraph)
