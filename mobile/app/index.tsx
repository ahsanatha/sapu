import { useEffect, useMemo, useState } from 'react'
import { FlatList, Platform, Pressable, RefreshControl, SafeAreaView, Text, View, Linking } from 'react-native'

type Article = {
  id: string
  url: string
  title: string
  site_id?: string
  created_at?: string
}

function getBaseUrl() {
  if (Platform.OS === 'android') return 'http://10.0.2.2:3000'
  if (Platform.OS === 'web') return ''
  return 'http://localhost:3000'
}

function getDomain(u: string): string {
  try {
    return new URL(u).host
  } catch {
    return ''
  }
}

function Avatar({ seed }: { seed: string }) {
  const ch = (seed || '?').trim().charAt(0).toUpperCase()
  return (
    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '600' }}>{ch}</Text>
    </View>
  )
}

function FeedItem({ item }: { item: Article }) {
  const domain = useMemo(() => getDomain(item.url), [item.url])
  const ts = item.created_at ? new Date(item.created_at).toLocaleString() : ''
  return (
    <View style={{ paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: '#eee', gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Avatar seed={domain || item.site_id || item.title} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={3} style={{ fontSize: 16, fontWeight: '600', color: '#0f172a' }}>{item.title}</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
            <Text style={{ color: '#475569', fontSize: 12 }}>{domain}</Text>
            <Text style={{ color: '#64748b', fontSize: 12 }}>{ts}</Text>
          </View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 16, marginLeft: 48 }}>
        <Pressable onPress={() => {}}>
          <Text style={{ color: '#374151' }}>Like</Text>
        </Pressable>
        <Pressable onPress={() => {}}>
          <Text style={{ color: '#374151' }}>Comment</Text>
        </Pressable>
        <Pressable onPress={() => {}}>
          <Text style={{ color: '#374151' }}>Share</Text>
        </Pressable>
        <Pressable onPress={() => { Linking.openURL(item.url).catch(() => {}) }}>
          <Text style={{ color: '#374151' }}>Open</Text>
        </Pressable>
      </View>
    </View>
  )
}

export default function Home() {
  const [items, setItems] = useState<Article[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)

  async function load(initial = false) {
    if (loading) return
    setLoading(true)
    const base = getBaseUrl()
    const qs = new URLSearchParams({ limit: String(20), offset: String(initial ? 0 : offset) })
    const url = `${base}/api/articles?${qs.toString()}`
    try {
      const res = await fetch(url)
      const data = await res.json()
      const list: Article[] = Array.isArray(data?.items) ? data.items : []
      if (initial) {
        setItems(list)
        setOffset(list.length)
      } else {
        setItems((prev) => [...prev, ...list])
        setOffset((prev) => prev + list.length)
      }
      setHasMore(list.length >= 20)
    } catch {
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void load(true)
  }, [])

  function onRefresh() {
    setRefreshing(true)
    setOffset(0)
    setHasMore(true)
    void load(true)
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        renderItem={({ item }) => <FeedItem item={item} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onEndReachedThreshold={0.6}
        onEndReached={() => { if (!loading && hasMore) void load(false) }}
        ListHeaderComponent={
          <View style={{ paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: '#eee' }}>
            <Text style={{ fontSize: 20, fontWeight: '700' }}>For You</Text>
          </View>
        }
      />
    </SafeAreaView>
  )
}
