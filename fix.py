import re

with open('src/app/crm-runtime-data.ts', 'r') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if 'vatRate: 22 }' in line and 'total:' not in line:
        # Check if it's inside QuoteLineRecord (which has description)
        if 'description:' in line:
            new_lines.append(line)
        else:
            # It's inside CashTransactionLine, remove the vatRate: 22 }
            line = line.replace(' vatRate: 22 }', ',')
            new_lines.append(line)
    else:
        new_lines.append(line)

with open('src/app/crm-runtime-data.ts', 'w') as f:
    f.writelines(new_lines)
