import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { colors, fontSize, MIN_TOUCH, spacing } from '@/constants/theme';

type Props = {
  title: string;
  subtitle?: string;
  /** 있으면 왼쪽 위에 뒤로가기 버튼 */
  onBack?: () => void;
  children: ReactNode;
  /** 화면 아래에 고정되는 영역 (주요 버튼) */
  footer?: ReactNode;
};

/** 입력 폼 화면 틀: 키보드가 올라와도 입력칸이 가려지지 않게 한다 (S02, S03, S04) */
export function FormScreen({ title, subtitle, onBack, children, footer }: Props) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.topBar}>
          {onBack ? (
            <Pressable accessibilityRole="button" accessibilityLabel="뒤로가기" onPress={onBack} style={styles.back} hitSlop={8}>
              <Icon name="arrow-left" size={24} color={colors.ink} />
            </Pressable>
          ) : null}
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <View style={styles.body}>{children}</View>
        </ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  topBar: { minHeight: MIN_TOUCH, paddingHorizontal: spacing.sm, justifyContent: 'center' },
  back: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  title: { color: colors.primary, fontSize: fontSize.title + 2, fontWeight: '900' },
  subtitle: { color: colors.sub, fontSize: fontSize.body },
  body: { marginTop: spacing.md, gap: spacing.md + 2 },
  footer: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
});
