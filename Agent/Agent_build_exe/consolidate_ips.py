import json

# Read existing trusted IPs
with open('trusted_ip_ranges.txt', 'r', encoding='utf-8') as f:
    existing_content = f.read()

# Collect all IPs
all_ips = set()

# Parse goog.json
with open('goog.json', 'r', encoding='utf-8') as f:
    goog_data = json.load(f)
    for prefix in goog_data.get('prefixes', []):
        if 'ipv4Prefix' in prefix:
            all_ips.add(prefix['ipv4Prefix'])
        if 'ipv6Prefix' in prefix:
            all_ips.add(prefix['ipv6Prefix'])

# Parse ip-ranges.json (AWS)
with open('ip-ranges.json', 'r', encoding='utf-8') as f:
    aws_data = json.load(f)
    for prefix in aws_data.get('prefixes', []):
        if 'ip_prefix' in prefix:
            all_ips.add(prefix['ip_prefix'])
    for prefix in aws_data.get('ipv6_prefixes', []):
        if 'ipv6_prefix' in prefix:
            all_ips.add(prefix['ipv6_prefix'])

# Parse cloud.json (Google Cloud)
with open('cloud.json', 'r', encoding='utf-8') as f:
    cloud_data = json.load(f)
    for prefix in cloud_data.get('prefixes', []):
        if 'ipv4Prefix' in prefix:
            all_ips.add(prefix['ipv4Prefix'])
        if 'ipv6Prefix' in prefix:
            all_ips.add(prefix['ipv6Prefix'])

# Parse ips-v4.txt
with open('ips-v4.txt', 'r', encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#'):
            all_ips.add(line)

# Parse ips-v6.txt
with open('ips-v6.txt', 'r', encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#'):
            all_ips.add(line)

# Separate IPv4 and IPv6
ipv4_ranges = sorted([ip for ip in all_ips if ':' not in ip])
ipv6_ranges = sorted([ip for ip in all_ips if ':' in ip])

# Write to trusted_ip_ranges.txt
with open('trusted_ip_ranges.txt', 'w', encoding='utf-8') as f:
    f.write(existing_content.rstrip() + '\n\n')
    
    f.write('# AWS IP Ranges\n')
    aws_v4 = [ip for ip in ipv4_ranges if any(ip.startswith(p) for p in ['3.', '15.', '16.', '18.', '23.', '35.', '40.', '43.', '50.', '51.', '52.', '54.', '56.', '64.', '65.', '69.', '71.', '77.', '96.', '99.', '104.', '120.', '136.', '139.', '150.', '151.', '161.', '192.', '205.', '216.', '1.', '13.', '31.'])]
    for ip in aws_v4:
        f.write(f'{ip}\n')
    
    f.write('\n# Additional IPv4 Ranges\n')
    for ip in ipv4_ranges:
        if ip not in aws_v4:
            f.write(f'{ip}\n')
    
    f.write('\n# IPv6 Ranges\n')
    for ip in ipv6_ranges:
        f.write(f'{ip}\n')

print(f'Successfully consolidated {len(all_ips)} IP ranges to trusted_ip_ranges.txt')
