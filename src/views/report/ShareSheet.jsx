// Hoja "Compartir resumen": vista previa de la imagen y botones Compartir / Descargar.
import { useEffect, useState } from 'react';
import { Button, Center, Group, Image, Loader, Stack, Text } from '@mantine/core';
import { IconDownload, IconShare } from '@tabler/icons-react';
import { openSheet } from '../../components/Sheet.jsx';
import { notify } from '../../components/dialogs.jsx';
import { downloadBlob, reportImage, shareOrDownload } from './shareImage.js';

function ShareBody({ r, title, subtitle, filename }) {
  const [img, setImg] = useState(null);
  useEffect(() => {
    let url;
    let alive = true;
    reportImage(r, { title, subtitle }).then((blob) => {
      if (!alive) return;
      url = URL.createObjectURL(blob);
      setImg({ blob, url });
    }).catch((e) => notify.error(e.message));
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [r, title, subtitle]);

  const canShare = typeof navigator !== 'undefined' && !!navigator.share;
  const share = async () => {
    const res = await shareOrDownload(img.blob, filename, title);
    if (res === 'downloaded') notify.success('Imagen descargada');
  };

  return (
    <Stack gap="md" data-testid="share-sheet">
      {img ? (
        <Image src={img.url} alt={`Resumen: ${title}`} radius="lg" data-testid="share-preview" />
      ) : (
        <Center h={300}><Loader type="dots" /></Center>
      )}
      <Group grow>
        {canShare ? (
          <Button leftSection={<IconShare size={18} />} onClick={share} disabled={!img} data-testid="share-go">Compartir</Button>
        ) : null}
        <Button
          variant={canShare ? 'default' : 'filled'} leftSection={<IconDownload size={18} />} disabled={!img}
          onClick={() => { downloadBlob(img.blob, filename); notify.success('Imagen descargada'); }} data-testid="share-download"
        >
          Descargar
        </Button>
      </Group>
      <Text size="xs" c="dimmed" ta="center">La imagen se crea en tu teléfono; no se sube a ningún lado.</Text>
    </Stack>
  );
}

export const openShareSheet = ({ r, title, subtitle, filename }) => openSheet({
  title: 'Compartir resumen',
  render: () => <ShareBody r={r} title={title} subtitle={subtitle} filename={filename} />,
});
