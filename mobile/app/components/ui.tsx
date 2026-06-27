import React from 'react'
import { Pressable, Text, View } from 'react-native'

export function UIHeading({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ padding: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: '600' }}>{children}</Text>
    </View>
  )
}

export function UIButton({ title, onPress }: { title: string; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ paddingVertical: 10, paddingHorizontal: 16, backgroundColor: '#111', borderRadius: 8 }}
    >
      <Text style={{ color: '#fff', fontWeight: '500' }}>{title}</Text>
    </Pressable>
  )
}
