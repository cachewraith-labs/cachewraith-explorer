import { ArrowUpDown } from 'lucide-react';
import { useState } from 'react';

import type { SortKey } from '@/ipc/types';
import { IconButton } from '@/shared/ui/IconButton';
import type { MenuEntry } from '@/shared/ui/menu';
import { MenuList } from '@/shared/ui/MenuList';
import { Popover } from '@/shared/ui/Popover';

import { useSettings } from '../../settings/store';

const KEYS: Array<[SortKey, string]> = [
  ['name', 'Name'],
  ['modified', 'Modified'],
  ['size', 'Size'],
  ['kind', 'Type'],
];

export function SortMenu() {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);

  const items: MenuEntry[] = [
    ...KEYS.map(([key, label]): MenuEntry => ({
      type: 'item',
      id: key,
      label,
      checked: settings.sortKey === key,
      run: () => update({ sortKey: key }),
    })),
    { type: 'separator', id: 's1' },
    {
      type: 'item',
      id: 'asc',
      label: 'Ascending',
      checked: settings.sortDirection === 'asc',
      run: () => update({ sortDirection: 'asc' }),
    },
    {
      type: 'item',
      id: 'desc',
      label: 'Descending',
      checked: settings.sortDirection === 'desc',
      run: () => update({ sortDirection: 'desc' }),
    },
    { type: 'separator', id: 's2' },
    {
      type: 'item',
      id: 'folders-first',
      label: 'Folders first',
      checked: settings.foldersFirst,
      run: () => update({ foldersFirst: !settings.foldersFirst }),
    },
  ];

  return (
    <>
      <IconButton
        icon={ArrowUpDown}
        label="Sort"
        active={anchor !== null}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setAnchor(anchor ? null : { x: rect.right - 200, y: rect.bottom + 6 });
        }}
      />
      <Popover
        open={anchor !== null}
        x={anchor?.x ?? 0}
        y={anchor?.y ?? 0}
        width={200}
        label="Sort options"
        onClose={() => setAnchor(null)}
      >
        <MenuList items={items} onDone={() => setAnchor(null)} />
      </Popover>
    </>
  );
}
