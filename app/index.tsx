import { StyleSheet, Text, View } from 'react-native';

export default function BootstrapScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Gym Tracker</Text>
      <Text style={styles.body}>Native bootstrap ready.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F6F7F5',
    padding: 24,
  },
  title: {
    color: '#171A1C',
    fontSize: 24,
    fontWeight: '700',
  },
  body: {
    marginTop: 8,
    color: '#5D656B',
    fontSize: 16,
  },
});
