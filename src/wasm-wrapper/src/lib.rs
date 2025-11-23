use wasm_bindgen::prelude::*;
use marqant::Marqant;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

macro_rules! console_log {
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

#[wasm_bindgen]
pub struct MarqantCompressor {
    compressor: Marqant,
}

#[wasm_bindgen]
impl MarqantCompressor {
    #[wasm_bindgen(constructor)]
    pub fn new() -> MarqantCompressor {
        console_log!("Initializing Marqant compressor");
        MarqantCompressor {
            compressor: Marqant::default(),
        }
    }

    #[wasm_bindgen]
    pub fn compress_markdown(&self, input: &str) -> Result<String, JsValue> {
        console_log!("Compressing markdown content (length: {})", input.len());
        match self.compressor.compress_markdown_with_flags(
            input,
            Some("--semantic --binary")
        ) {
            Ok(compressed) => {
                let ratio = 1.0 - (compressed.len() as f64 / input.len() as f64);
                console_log!("Compression successful: {} -> {} bytes ({:.1}% reduction)",
                    input.len(), compressed.len(), ratio * 100.0);
                Ok(compressed)
            },
            Err(e) => {
                console_log!("Compression error: {:?}", e);
                Err(JsValue::from_str(&format!("Compression error: {}", e)))
            },
        }
    }

    #[wasm_bindgen]
    pub fn decompress(&self, input: &str) -> Result<String, JsValue> {
        console_log!("Decompressing content (length: {})", input.len());
        match self.compressor.decompress_marqant(input) {
            Ok(decompressed) => {
                console_log!("Decompression successful: {} -> {} bytes",
                    input.len(), decompressed.len());
                Ok(decompressed)
            },
            Err(e) => {
                console_log!("Decompression error: {:?}", e);
                Err(JsValue::from_str(&format!("Decompression error: {}", e)))
            },
        }
    }

    #[wasm_bindgen]
    pub fn get_compression_ratio(&self, original: &str, compressed: &str) -> f64 {
        if original.is_empty() {
            return 0.0;
        }
        let ratio = 1.0 - (compressed.len() as f64 / original.len() as f64);
        console_log!("Compression ratio: {:.3}", ratio);
        ratio
    }
}

#[wasm_bindgen(start)]
pub fn main() {
    console_log!("Marqant WebAssembly module loaded");
}