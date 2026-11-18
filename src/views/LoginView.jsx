// Pantalla de acceso: pide la clave APP_PASSWORD una vez por dispositivo.
import { useState } from 'react';
import { Box, Button, Center, PasswordInput, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconBarbell, IconLock } from '@tabler/icons-react';
import { setKey } from '../lib/api.js';
import { refresh, flush } from '../lib/data.js';
import { navigate } from '../lib/router.js';

export function LoginView() {
  const [value, setValue] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const go = async (e) => {
    e.preventDefault();
    setKey(value);
    setLoading(true);
    setError(null);
    try {
      await refresh();
      flush();
      navigate('/train', { replace: true });
    } catch (err) {
      setError(err.status === 401 ? 'Clave incorrecta' : err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Center mih="100dvh" px="lg" style={{ background: 'radial-gradient(120% 60% at 50% 0%, var(--mantine-color-brand-light) 0%, transparent 60%)' }}>
      <Box w="100%" maw={380} component="form" onSubmit={go}>
        <Stack gap="lg">
          <Stack align="center" gap="xs">
            <ThemeIcon size={72} radius={22} variant="gradient" gradient={{ from: 'brand.4', to: 'brand.8', deg: 135 }}>
              <IconBarbell size={40} stroke={1.8} />
            </ThemeIcon>
            <Title order={1} mt="xs">GymLog</Title>
            <Text c="dimmed" ta="center" size="sm">Ingresa la clave que configuraste en Vercel (APP_PASSWORD).</Text>
          </Stack>
          <PasswordInput
            placeholder="Clave de acceso"
            leftSection={<IconLock size={18} />}
            autoComplete="current-password"
            value={value}
            onChange={(e) => setValue(e.currentTarget.value)}
            error={error}
            size="lg"
            radius="lg"
            autoFocus
            data-testid="login-key"
          />
          <Button type="submit" size="lg" radius="lg" loading={loading} fullWidth>Entrar</Button>
        </Stack>
      </Box>
    </Center>
  );
}
