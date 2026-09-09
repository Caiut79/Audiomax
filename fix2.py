import re

with open('src/app/crm-runtime-data.ts', 'r') as f:
    content = f.read()

# Fix unitPrice: X,, to unitPrice: X,
content = re.sub(r'unitPrice:\s*(\d+),,', r'unitPrice: \1,', content)

# Fix unitPrice: X, vatRate: 22 } missing comma and brace issue
# Wait, for the ones that need vatRate: 22 }, it should be:
# unitPrice: 1800, vatRate: 22 }  --> unitPrice: 1800, vatRate: 22 },
# Let's just fix it manually for the known lines:
content = re.sub(r'(unitPrice:\s*\d+,\s*vatRate:\s*22\s*)\}', r'\1},', content)

# And if there are any lines with `unitPrice: X,` that are inside `lines: [` but missing `originalUnitPrice`, we can just leave them if they don't cause TS errors, BUT `originalUnitPrice` is required in `CashTransactionLine`!
# So let's add `originalUnitPrice` to `CashTransactionLine` objects.
# We know `CashTransactionLine` has `productId:`
def add_original(match):
    return match.group(1) + f"\n          originalUnitPrice: {match.group(2)},"

content = re.sub(r'(productId:\s*\'cash-prod-\d+\',\s*.*?unitPrice:\s*(\d+),)', add_original, content, flags=re.DOTALL)

with open('src/app/crm-runtime-data.ts', 'w') as f:
    f.write(content)
