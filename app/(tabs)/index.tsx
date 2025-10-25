import { CameraView, useCameraPermissions } from "expo-camera";
import { extractTextFromImage } from "expo-text-extractor";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface ExtractedData {
  allPrices: string[];
  itemPrices: string[];
  labeledPrices: { label: string; value: string }[];
  total: string;
}

export default function InvoiceScanner() {
  const [permission, requestPermission] = useCameraPermissions();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(
    null
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [rawText, setRawText] = useState("");
  const [showRawText, setShowRawText] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionContainer}>
          <Text style={styles.message}>
            We need your permission to access the camera
          </Text>
          <TouchableOpacity style={styles.button} onPress={requestPermission}>
            <Text style={styles.buttonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync();
        if (photo?.uri) {
          setImageUri(photo.uri);
          extractInvoiceData(photo.uri);
        }
      } catch (error) {
        console.error("Error taking picture:", error);
        Alert.alert("Error", "Failed to take picture");
      }
    }
  };

  const extractInvoiceData = async (uri: string) => {
    setIsProcessing(true);
    try {
      // Extract text using expo-text-extractor
      const textArray = await extractTextFromImage(uri);
      const text = textArray.join("\n");

      console.log("Extracted text:", text);
      setRawText(text);

      // Parse invoice data to extract only prices
      const parsedData = parseInvoiceData(text);
      setExtractedData(parsedData);
    } catch (error) {
      console.error("OCR Error:", error);
      Alert.alert("Error", "Failed to extract text from image");
    } finally {
      setIsProcessing(false);
    }
  };

  const parseInvoiceData = (text: string): ExtractedData => {
    console.log("Raw OCR Text:", text);

    // Extract all prices - various formats
    const prices: string[] = [];
    const seenPrices = new Set<string>();

    // Pattern 1: Dollar sign followed by number (e.g., $5.25, $11.83)
    const dollarPrices = text.matchAll(/\$\s*([\d,]+\.?\d{0,2})/g);
    for (const match of dollarPrices) {
      const price = match[1].replace(/,/g, "");
      if (!seenPrices.has(price) && parseFloat(price) < 100000) {
        prices.push(price);
        seenPrices.add(price);
      }
    }

    // Pattern 2: Numbers with decimal points (price format) - standalone
    const decimalPrices = text.matchAll(/\b(\d{1,6}\.\d{2})\b/g);
    for (const match of decimalPrices) {
      const price = match[1];
      // Avoid duplicates and filter out unrealistic prices
      const numPrice = parseFloat(price);
      if (!seenPrices.has(price) && numPrice < 100000 && numPrice > 0) {
        prices.push(price);
        seenPrices.add(price);
      }
    }

    // Pattern 3: Look for common price indicators with labels
    const pricePatterns = [
      {
        pattern: /subtotal\s*:?\s*\$?\s*([\d,]+\.?\d{0,2})/i,
        label: "Subtotal",
      },
      {
        pattern: /sub\s*total\s*:?\s*\$?\s*([\d,]+\.?\d{0,2})/i,
        label: "Subtotal",
      },
      { pattern: /total\s*:?\s*\$?\s*([\d,]+\.?\d{0,2})/i, label: "Total" },
      { pattern: /amount\s*:?\s*\$?\s*([\d,]+\.?\d{0,2})/i, label: "Amount" },
      { pattern: /tax\s*:?\s*\$?\s*([\d,]+\.?\d{0,2})/i, label: "Tax" },
      {
        pattern: /discount\s*:?\s*\$?\s*([\d,]+\.?\d{0,2})/i,
        label: "Discount",
      },
    ];

    const labeledPrices: { label: string; value: string }[] = [];
    const labeledPriceValues = new Set<string>();

    for (const { pattern, label } of pricePatterns) {
      const match = text.match(pattern);
      if (match) {
        const value = match[1].replace(/,/g, "");
        if (!labeledPriceValues.has(value)) {
          labeledPrices.push({ label, value });
          labeledPriceValues.add(value);
        }
      }
    }

    // Find total amount specifically
    const totalMatch = text.match(/total\s*:?\s*\$?\s*([\d,]+\.?\d{2})/i);
    let total = "N/A";
    if (totalMatch) {
      total = totalMatch[1].replace(/,/g, "");
    } else if (prices.length > 0) {
      // If no explicit total found, use the largest price
      const numericPrices = prices.map((p) => parseFloat(p));
      const maxPrice = Math.max(...numericPrices);
      total = maxPrice.toFixed(2);
    }

    // Extract individual item prices (numbers before subtotal/total section)
    const lines = text.split("\n");
    const itemPrices: string[] = [];
    const itemPriceSet = new Set<string>();
    let foundSubtotal = false;

    for (const line of lines) {
      // Stop collecting item prices after subtotal/total section
      if (/subtotal|total|tax|discount|payment/i.test(line)) {
        foundSubtotal = true;
        continue;
      }

      if (!foundSubtotal) {
        // Look for price patterns in item lines
        const priceMatch = line.match(/(\d{1,6}\.\d{2})/);
        if (priceMatch) {
          const price = priceMatch[1];
          const numPrice = parseFloat(price);
          if (!itemPriceSet.has(price) && numPrice < 1000 && numPrice > 0) {
            itemPrices.push(price);
            itemPriceSet.add(price);
          }
        }
      }
    }

    return {
      allPrices: prices,
      itemPrices: itemPrices.length > 0 ? itemPrices : [],
      labeledPrices,
      total,
    };
  };

  const resetScanner = () => {
    setImageUri(null);
    setExtractedData(null);
    setRawText("");
    setIsProcessing(false);
    setShowRawText(false);
  };

  return (
    <View style={styles.container}>
      {!imageUri ? (
        <>
          <CameraView style={styles.camera} ref={cameraRef} facing="back" />
          {/* Overlay with absolute positioning - fixes the warning */}
          <View style={styles.overlay}>
            <View style={styles.scanFrame} />
            <Text style={styles.instructionText}>
              Position invoice within the frame
            </Text>
          </View>
          <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
            <View style={styles.captureButtonInner} />
          </TouchableOpacity>
        </>
      ) : (
        <ScrollView style={styles.resultContainer}>
          <Image source={{ uri: imageUri }} style={styles.imagePreview} />

          {isProcessing ? (
            <View style={styles.processingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.processingText}>
                Extracting prices from invoice...
              </Text>
            </View>
          ) : (
            <>
              {extractedData && (
                <View style={styles.dataContainer}>
                  <Text style={styles.sectionTitle}>💰 Extracted Prices</Text>

                  {/* Total Amount - Highlighted */}
                  <View style={[styles.dataRow, styles.totalRow]}>
                    <Text style={styles.dataLabel}>Total Amount:</Text>
                    <Text style={[styles.dataValue, styles.totalAmount]}>
                      ${extractedData.total}
                    </Text>
                  </View>

                  {/* Labeled Prices (Subtotal, Tax, etc.) */}
                  {extractedData.labeledPrices.length > 0 && (
                    <>
                      <Text style={styles.subTitle}>📊 Breakdown</Text>
                      {extractedData.labeledPrices.map((item, index) => (
                        <View key={index} style={styles.dataRow}>
                          <Text style={styles.dataLabel}>{item.label}:</Text>
                          <Text style={styles.dataValue}>${item.value}</Text>
                        </View>
                      ))}
                    </>
                  )}

                  {/* Individual Item Prices */}
                  {extractedData.itemPrices.length > 0 && (
                    <>
                      <Text style={styles.subTitle}>🛒 Item Prices</Text>
                      {extractedData.itemPrices.map((price, index) => (
                        <View key={index} style={styles.priceItem}>
                          <Text style={styles.itemText}>Item {index + 1}:</Text>
                          <Text style={styles.priceText}>${price}</Text>
                        </View>
                      ))}
                    </>
                  )}

                  {/* All Detected Prices */}
                  {extractedData.allPrices.length > 0 && (
                    <>
                      <Text style={styles.subTitle}>
                        🔍 All Detected Prices
                      </Text>
                      <View style={styles.priceGrid}>
                        {extractedData.allPrices.map((price, index) => (
                          <View key={index} style={styles.priceChip}>
                            <Text style={styles.chipText}>${price}</Text>
                          </View>
                        ))}
                      </View>
                    </>
                  )}

                  {/* Raw Text - Collapsible */}
                  <TouchableOpacity
                    onPress={() => setShowRawText(!showRawText)}
                    style={styles.rawTextToggle}
                  >
                    <Text style={styles.toggleText}>
                      {showRawText ? "▼ Hide" : "▶ Show"} Raw Text
                    </Text>
                  </TouchableOpacity>

                  {showRawText && (
                    <View style={styles.rawTextContainer}>
                      <Text style={styles.rawText}>{rawText}</Text>
                    </View>
                  )}
                </View>
              )}

              <TouchableOpacity style={styles.button} onPress={resetScanner}>
                <Text style={styles.buttonText}>📸 Scan Another Invoice</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
    pointerEvents: "none",
  },
  scanFrame: {
    width: 300,
    height: 400,
    borderWidth: 3,
    borderColor: "#fff",
    borderRadius: 12,
    backgroundColor: "transparent",
  },
  instructionText: {
    color: "#fff",
    fontSize: 16,
    marginTop: 20,
    textAlign: "center",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    padding: 12,
    borderRadius: 8,
    overflow: "hidden",
  },
  captureButton: {
    position: "absolute",
    bottom: 40,
    alignSelf: "center",
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#007AFF",
  },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  resultContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  imagePreview: {
    width: "100%",
    height: 300,
    resizeMode: "contain",
    backgroundColor: "#000",
  },
  processingContainer: {
    padding: 40,
    alignItems: "center",
  },
  processingText: {
    marginTop: 20,
    fontSize: 16,
    color: "#666",
  },
  dataContainer: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 15,
    color: "#333",
  },
  totalRow: {
    backgroundColor: "#e8f5e9",
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: "#4caf50",
  },
  subTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 20,
    marginBottom: 12,
    color: "#555",
  },
  dataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  dataLabel: {
    fontSize: 16,
    color: "#666",
    fontWeight: "600",
  },
  dataValue: {
    fontSize: 16,
    color: "#333",
    fontWeight: "500",
  },
  totalAmount: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#2e7d32",
  },
  priceItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#f5f5f5",
    marginBottom: 6,
    borderRadius: 8,
  },
  itemText: {
    fontSize: 15,
    color: "#666",
    fontWeight: "500",
  },
  priceText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#007AFF",
  },
  priceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 8,
  },
  priceChip: {
    backgroundColor: "#e3f2fd",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#90caf9",
  },
  chipText: {
    color: "#1976d2",
    fontSize: 15,
    fontWeight: "600",
  },
  rawTextToggle: {
    backgroundColor: "#f5f5f5",
    padding: 14,
    borderRadius: 8,
    marginTop: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
  },
  toggleText: {
    color: "#007AFF",
    fontSize: 15,
    fontWeight: "600",
  },
  rawTextContainer: {
    marginTop: 10,
    backgroundColor: "#f9f9f9",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  rawText: {
    fontSize: 12,
    color: "#666",
    lineHeight: 18,
  },
  button: {
    backgroundColor: "#007AFF",
    padding: 16,
    borderRadius: 12,
    margin: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  buttonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
  message: {
    textAlign: "center",
    paddingBottom: 20,
    fontSize: 16,
    color: "#fff",
  },
});
