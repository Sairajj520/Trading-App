const FINNHUB_API_KEY = 'd3j0hl9r01qruraiufagd3j0hl9r01qruraiufb0';
const API_ENDPOINTS = {
    // Free APIs for real-time data
    COINAPI: 'https://api.api-ninjas.com/v1/cryptoprice',
    FINNHUB: 'https://finnhub.io/api/v1/quote',
    COINGECKO: 'https://api.coingecko.com/api/v3/simple/price'
};

// API Keys
const API_CONFIG = {
    NINJAS_API_KEY: 'ija8x7QN5TBZmxDuwBs3aw==GXYeBCzrFSNa6uFh', // Get free from api-ninjas.com
    FINNHUB_API_KEY: 'd3ad4vhr01qlsbrqtl30d3ad4vhr01qlsbrqtl3g' ,
     // Get free from finnhub.io
};

class TradingViewApp {
    constructor() {
        this.chart = null;
        this.candlestickSeries = null;
        this.volumeSeries = null;
        this.indicators = {};
        this.currentSymbol = '';
        this.currentTimeframe = '5m';
        this.isRealtime = false;
        this.realtimeInterval = null;
        this.currentTheme = 'dark';
        this.chartStyle = 'candlestick';
        this.drawingMode = null;
        this.chartData = [];
        this.realTimeUIInterval = null;
        this.watchlistData = null;
        this.watchlistRealData = null;
        this.watchlistUpdateInterval = null;
        this.isStreamingCsv = false;
        this.csvStreamingInterval = null;
        this.csvStreamIndex = 0;
        this.csvFullData = null; // Store complete CSV data
        this.streamingSpeed = 2000; // 2 seconds per candle
        this.livePrices = {};  // Cache live prices
        this.isDataFromCSV = false; // Track data source
        // Initialize empty chart data - will be populated by CSV or live data
        this.chartData = [];
        this.csvData = null; // Store CSV data separately
        this.dynamicIndicators = {}; // Track discovered columns
        this.availableCustomIndicators = []; // List of custom columns found in CSV
        this.livePriceCache = {}; // Initialize price cache
        this.isStreamingFromServer = false;
        this.serverStreamInterval = null;
        this.serverData = null;
        this.serverStreamIndex = 0;
        this.serverUrl = 'http://localhost:8080';
        this.isStreamingFromServer = false;
        this.serverStreamInterval = null;
        this.serverData = null;
        this.serverStreamIndex = 0;
        this.indicatorKeys = [];
        this.dynamicCsvHeader = null;
        this.customIndicators = {}; // Store custom indicator series
        this.socket = null;
        this.signalMarkers = [];
        this.timeframeMap = {
            "1m": 60,
            "5m": 60 * 5,
            "15m": 60 * 15,
            "30m": 60 * 30,
            "1h": 60 * 60,
            "4h": 60 * 60 * 4,
            "1D": 60 * 60 * 24,
            "1W": 60 * 60 * 24 * 7
        };
        
        // Time-stamp color
        this.indicatorColorRanges = [
            { start: "09:15", end: "10:00", color: "green" },
            { start: "10:00", end: "12:30", color: "red" },
        ];


        this.isPaused = false;

        // Initialize immediately - don't wait for library
        setTimeout(() => {
            this.init();
        }, 100);
        window.tradingApp = this;
    }

    formatNumber(n, dp = 2) {
        if (n === undefined || n === null || Number.isNaN(+n)) return '—';
        return (+n).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
      }
    

    init() {
        // Hide loading overlay immediately
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }
        
        console.log('Initializing TradingView App...');
        console.log('Sample data generated:', this.chartData.length, 'candles');
        
        // Setup event listeners first
        this.setupEventListeners();
        
        // Initialize chart
        this.initializeChart();
        
        // Only load data if CSV has been uploaded or we have data
        if (this.chartData.length > 0) {
            this.loadData();
        } else {
        // Show message to upload CSV
        this.showNotification('Please upload a CSV file to view chart data', 'info');
        }

        // Update chart info
        this.updateChartInfo();

        // Start real-time UI updates immediately
        this.startRealTimeUIUpdates();
        
        // Initialize watchlist with real data
        this.initializeWatchlistRealData();

        // In your init() method, add this line:
        this.initializeWatchlistRealData(); // This should already be there

        this.updateSymbolDisplay();

        this.initSocketAndHandlers();

    
    // Fetch initial price for default symbol
    this.fetchLiveQuote(this.currentSymbol)
        .then(data => {
            this.livePriceCache[this.currentSymbol] = data;
            this.updateSymbolPrice();
        })
        .catch(error => {
            console.log('Could not fetch initial price:', error);
        });


    }

    // API methods
    async fetchRealTimePrice(symbol) {
        return await this.fetchLiveQuote(symbol);
      }
      
async fetchLiveQuote(symbol) {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`
    );
    const q = await res.json();
    return {
      price: q.c,
      change24h: ((q.c - q.pc) / q.pc) * 100,
      timestamp: Date.now()
    };
  } catch (e) {
    console.error('Finnhub error', e);
    throw e;
  }
}


// Get fallback prices - NOW WITH LIVE DATA!
async getFallbackPrice(symbol) {
    try {
        console.log('Attempting to fetch live fallback price for:', symbol);
        
        // Try to get live price first
        const livePrice = await this.fetchRealTimePrice(symbol);
        console.log('Successfully fetched live fallback price:', livePrice);
        return livePrice;
        
    } catch (error) {
        console.log('Live fallback failed, using realistic simulated prices for:', symbol);
        
        // Only if live fetch completely fails, use dynamic base prices
        const basePrices = {
            'BTCUSD': await this.getRecentCryptoPrice('bitcoin', 65000),      // Around current BTC
            'ETHUSD': await this.getRecentCryptoPrice('ethereum', 3500),      // Around current ETH  
            'AAPL': 175.50,    // Recent Apple price
            'GOOGL': 138.20,   // Recent Google price
            'TSLA': 180.25     // Recent Tesla price
        };
        
        const basePrice = basePrices[symbol] || 100;
        
        // Add realistic volatility
        const volatility = symbol.includes('USD') ? 0.02 : 0.01; // Crypto more volatile
        const randomChange = (Math.random() - 0.5) * volatility;
        
        return {
            price: basePrice * (1 + randomChange),
            change24h: randomChange * 100,
            timestamp: Date.now()
        };
    }
}

    // Generate sample OHLCV data
    generateSampleData() {
        const data = [];
        let currentPrice = 43250;
        
        // Use current date instead of hardcoded 2024-01-01
        const today = new Date();
        const startDate = new Date(today.getTime() - (200 * 24 * 60 * 60 * 1000)); // 200 days ago
        
        console.log('Generating data from:', startDate.toISOString().split('T')[0], 'to:', today.toISOString().split('T')[0]);
        
        for (let i = 0; i < 200; i++) {
            const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
            const dateString = date.toISOString().split('T')[0];
            
            // Generate realistic price movement
            const volatility = 0.02;
            const trend = Math.sin(i * 0.1) * 0.001;
            const change = (Math.random() - 0.5) * 2 * volatility * currentPrice + trend * currentPrice;
            currentPrice = Math.max(currentPrice + change, 1000);
            
            const spread = currentPrice * 0.01;
            const high = currentPrice + Math.random() * spread;
            const low = currentPrice - Math.random() * spread;
            const open = low + Math.random() * (high - low);
            const close = low + Math.random() * (high - low);
            const volume = Math.floor(Math.random() * 2000000) + 500000;
            
            data.push({
                time: Math.floor(new Date(dateString).getTime()/1000),
                open: parseFloat(open.toFixed(2)),
                high: parseFloat(high.toFixed(2)),
                low: parseFloat(low.toFixed(2)),
                close: parseFloat(close.toFixed(2)),
                volume: volume
            });
        }
        
        console.log('Generated sample data:', data.length, 'candles');
        
        // 🔧 SAFETY CHECK: Only access array if it has data
        if (data.length > 0) {
            console.log('Latest candle date:', data[data.length - 1].time);
            console.log('First candle date:', data[0].time);
        } else {
            console.error('No data generated!');
        }
        
        return data;
    }

    // Add this method after generateSampleData()
    async generateSampleDataForSymbol(symbol) {
        console.log('Generating data for symbol:', symbol);
        
        // Fetch real current price
        let currentPriceData;
        try {
            currentPriceData = await this.fetchRealTimePrice(symbol);
        } catch (error) {
            currentPriceData = await this.getFallbackPrice(symbol);
        }
        
        let currentPrice = currentPriceData.price;
        console.log(`Real current price for ${symbol}: $${currentPrice}`);
        
        const data = [];
        const today = new Date();
        const startDate = new Date(today.getTime() - (200 * 24 * 60 * 60 * 1000)); // 200 days ago
        
        // Start with a historical price 200 days ago (simulate past data)
        let historicalStartPrice = currentPrice * (0.7 + Math.random() * 0.6); // 70-130% of current
        
        for (let i = 0; i < 200; i++) {
            const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
            const dateString = date.toISOString().split('T')[0];
            
            // Different volatility for different assets
            const volatility = symbol.includes('USD') ? 0.03 : 0.02;
            
            // Trend towards current price
            const trendFactor = i / 200;
            const targetPrice = historicalStartPrice + (currentPrice - historicalStartPrice) * trendFactor;
            
            const change = (Math.random() - 0.5) * 2 * volatility * targetPrice;
            const dailyPrice = targetPrice + change;
            
            const spread = dailyPrice * 0.01;
            const high = dailyPrice + Math.random() * spread;
            const low = dailyPrice - Math.random() * spread;
            const open = low + Math.random() * (high - low);
            const close = i === 199 ? currentPrice : (low + Math.random() * (high - low)); // Last candle = real price
            const volume = Math.floor(Math.random() * 2000000) + 500000;
            
            data.push({
                time: Math.floor(new Date(dateString).getTime()/1000),
                open: parseFloat(open.toFixed(2)),
                high: parseFloat(high.toFixed(2)),
                low: parseFloat(low.toFixed(2)),
                close: parseFloat(close.toFixed(2)),
                volume: volume
            });
        }
        
        console.log('Generated', data.length, 'candles for', symbol, 'ending at real price:', currentPrice);
        return data;
    }
    
    // Initialize TradingView Lightweight Charts
    initializeChart() {
        const chartContainer = document.getElementById('chart');
        
        if (!chartContainer) {
            console.error('Chart container not found');
            return;
        }
        
        console.log('Checking for LightweightCharts library...');
        
        if (typeof LightweightCharts === 'undefined') {
            console.error('TradingView library not loaded, trying fallback...');
            chartContainer.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #26a69a; flex-direction: column; font-size: 16px;"><div>📊</div><div>Chart library loading...</div><div style="font-size: 12px; margin-top: 10px;">Please wait while the chart initializes</div></div>';
            
            // Try again after a delay
            setTimeout(() => {
                if (typeof LightweightCharts !== 'undefined') {
                    console.log('Library loaded on retry');
                    this.initializeChart();
                } else {
                    chartContainer.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #ef5350; flex-direction: column; font-size: 16px;"><div>⚠️</div><div>Chart library failed to load</div><div style="font-size: 12px; margin-top: 10px;">Please refresh the page</div></div>';
                }
            }, 2000);
            return;
        }
        
        try {
            console.log('Initializing chart with library...');
            
            // Clear container
            chartContainer.innerHTML = '';
            
            const chartOptions = {
                width: chartContainer.clientWidth,
                height: chartContainer.clientHeight,
                layout: {
                    backgroundColor: "#131722",
                    textColor: this.currentTheme === 'dark' ? '#d1d4dc' : '#000000',         // visible grey
                    fontSize: 12,
                    fontFamily: "Segoe UI, Roboto, sans-serif",
                },
                grid: {
                    vertLines: {
                        color: "rgba(0, 0, 0, 0.04)",   // Ultra faint vertical grid
                        style: LightweightCharts.LineStyle.Solid
                    },
                    horzLines: {
                        color: "rgba(0, 0, 0, 0.06)",   // Slightly more visible horizontal grid
                        style: LightweightCharts.LineStyle.Solid
                    }
                },
                crosshair: {
                    mode: LightweightCharts.CrosshairMode.Magnet,  // or Normal
                    vertLine: {
                        visible: true,
                        labelVisible: false,
                        color: "rgba(0,0,0,0.25)",
                        width: 1,
                        style: LightweightCharts.LineStyle.Dashed,
                    },
                    horzLine: {
                        visible: false
                    }
                },
                
                rightPriceScale: {
                    visible: true,
                    borderColor: "rgba(255,255,255,0.35)", 
                    textColor: "#000000",                  
                },
                timeScale: {
                    visible: true,
                    borderColor: "rgba(255,255,255,0.35)",
                    textColor: "#000000",
                    hour12: false
                },
                handleScroll: {
                    mouseWheel: true,
                    pressedMouseMove: true,
                },
                handleScale: {
                    axisPressedMouseMove: true,
                    mouseWheel: true,
                    pinch: true,
                },
            };

            this.chart = LightweightCharts.createChart(chartContainer, chartOptions);
            console.log('Chart created successfully');

            

            
            // Add candlestick series
            this.candlestickSeries = this.chart.addCandlestickSeries({
                upColor: "#26a69a",
                downColor: "#ef5350",
                wickUpColor: "#26a69a",
                wickDownColor: "#ef5350",
                borderUpColor: "#26a69a",
                borderDownColor: "#ef5350",
                borderVisible: false,
            });
            
            console.log('Candlestick series added');

            // Add volume series
            this.volumeSeries = this.chart.addHistogramSeries({
                priceScaleId: 'volume',
                priceFormat: {
                    type: 'volume',
                },
                scaleMargins: {
                    top: 0.8,     // 20% height for volume
                    bottom: 0,
                },
            });

            
            this.chart.applyOptions({
                leftPriceScale: {
                    visible: false
                },
                rightPriceScale: {
                    visible: true,
                },
                overlayPriceScales: {
                    visible: false,
                }
            });

            this.chart.priceScale('volume').applyOptions({
                scaleMargins: {
                    top: 0.8,
                    bottom: 0,
                }
            });

            const ts = this.chart.timeScale();
            ts.applyOptions({
                textColor: "#000000",
                borderColor: "rgba(0,0,0,0.1)",
                tooltip: { visible: false },
                timeVisible: true,
                secondsVisible: false,
                // Core: TradingView-style formatter in IST
                tickMarkFormatter: (time, tickMarkType) =>
                    this.tradingViewTickFormatter(time, tickMarkType)
            });

            
             
            
            
        
            // Handle window resize
            const resizeObserver = new ResizeObserver(() => {
                if (this.chart && chartContainer) {
                    this.chart.applyOptions({
                        width: chartContainer.clientWidth,
                        height: chartContainer.clientHeight,
                    });
                }
            });
            resizeObserver.observe(chartContainer);
            console.log('Chart initialized successfully');
            setTimeout(() => {
                this.chart.applyOptions({
                    layout: { textColor: "#000000" },
                    rightPriceScale: { textColor: "#000000" },
                    timeScale: { textColor: "#000000" }
                });
            }, 50);

            //tooltip
            const tooltip = document.getElementById("ohlcTooltip");
            const chartEl = document.getElementById("chart");

            let lastValidOhlc = null;   // STORE LAST VALID CANDLE (IMPORTANT)

            this.chart.subscribeCrosshairMove(param => {

    const mouseInside =
        param.point &&
        param.point.x >= 0 &&
        param.point.y >= 0 &&
        param.point.x <= chartEl.clientWidth &&
        param.point.y <= chartEl.clientHeight;

    if (!mouseInside) {
        tooltip.style.display = "none";
        return;
    }

    // Try reading candle
    const ohlc = param.seriesData?.get(this.candlestickSeries);

    // KEEP tooltip with last valid candle
    if (!ohlc) {
        if (lastValidOhlc === null) {
            tooltip.style.display = "none";
            return;
        }
    }

    const data = ohlc || lastValidOhlc;
    lastValidOhlc = data;   // update cache

    // Candle direction color
    const isGreen = data.close >= data.open;
    const candleColor = isGreen ? "#26a69a" : "#ef5350";


    // Date/time formatting
    const d = new Date((param.time || lastValidOhlc.time) * 1000);
    const dateStr = d.toLocaleDateString("en-GB", {
        day: "2-digit", month: "short", year: "2-digit"
    });
    const timeStr = d.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
    });
    

    // Update tooltip
    tooltip.innerHTML = `
        <div>O <span style="color:${candleColor}">${data.open.toFixed(2)}</span></div>
        <div>H <span style="color:${candleColor}">${data.high.toFixed(2)}</span></div>
        <div>L <span style="color:${candleColor}">${data.low.toFixed(2)}</span></div>
        <div>C <span style="color:${candleColor}">${data.close.toFixed(2)}</span></div>
        <div style="margin-top:6px;opacity:0.8">${dateStr}<br>${timeStr}</div>
    `;

    tooltip.style.display = "block";

    // position
    // ======== Tooltip Position (Final TradingView Version) ========

        // 1. screen coordinates of chart container
        const chartRect = chartEl.getBoundingClientRect();

        // 2. desired screen position relative to crosshair
        let screenX = chartRect.left + param.point.x;
        let screenY = chartRect.top + param.point.y;

        // Show tooltip first to measure it
        tooltip.style.display = "block";
        const tw = tooltip.offsetWidth;
        const th = tooltip.offsetHeight;

        const pad = 10;

        // -----------------------------
        // Horizontal flip + clamp
        // -----------------------------
        if (param.point.x < chartRect.width / 2) {
            // cursor on left → tooltip on right
            screenX += pad;
        } else {
            // cursor on right → tooltip on left
            screenX -= tw + pad;
        }

        // clamp inside chart horizontally
        if (screenX < chartRect.left + pad) {
            screenX = chartRect.left + pad;
        }
        if (screenX + tw > chartRect.right - pad) {
            screenX = chartRect.right - tw - pad;
        }

        // -----------------------------
        // Vertical flip + clamp
        // -----------------------------
        if (param.point.y < chartRect.height / 2) {
            // cursor on top → tooltip below
            screenY += pad;
        } else {
            // cursor on bottom → tooltip above
            screenY -= th + pad;
        }

        // clamp inside chart vertically
        if (screenY < chartRect.top + pad) {
            screenY = chartRect.top + pad;
        }
        if (screenY + th > chartRect.bottom - pad) {
            screenY = chartRect.bottom - th - pad;
        }

        // -----------------------------
        // APPLY FINAL POSITION (use absolute screen coordinates)
        // -----------------------------
        tooltip.style.left = `${screenX}px`;
        tooltip.style.top  = `${screenY}px`;

        });


        } catch (error) {
            console.error('Error initializing chart:', error);
            chartContainer.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #ef5350; flex-direction: column;"><div>⚠️ Error initializing chart</div><div style="font-size: 12px; margin-top: 10px;">${error.message}</div></div>`;
        }
    }

    

    updateCandleWidth(tf) {
        const widths = {
            "1m": 0.6,
            "5m": 0.7,
            "15m": 0.75,
            "30m": 0.8,
            "1h": 0.85,
            "4h": 0.9,
            "1D": 0.9,
            "1W": 0.95
        };
        this.candlestickSeries.applyOptions({ 
            wickVisible: true,
            borderVisible: false,
            barSpacing: widths[tf] || 0.7
        });
    }


    // Load data into chart
    loadData() {
        console.log('Loading data into chart...');
        
        if (!this.chart || !this.candlestickSeries || !this.volumeSeries) {
            console.error('Chart or series not initialized');
            return;
        }
        
        if (this.chartData.length === 0) {
            console.log('No chart data available - chart will be empty until CSV is uploaded or live mode is started');
            // Clear existing data
            this.candlestickSeries.setData([]);
            this.volumeSeries.setData([]);
            return;
        }
        
        try {
            console.log('Setting candlestick data:', this.chartData.length, 'candles');
            this.candlestickSeries.setData(this.chartData);
            
            // Set volume data
            const volumeData = this.chartData.map(item => ({
                time: item.time,
                value: item.volume,
                color: item.close >= item.open 
                    ? (this.currentTheme === 'dark' ? '#26a69a80' : '#08998180')
                    : (this.currentTheme === 'dark' ? '#ef535080' : '#f2364580')
            }));
            
            console.log('Setting volume data:', volumeData.length, 'bars');
            this.volumeSeries.setData(volumeData);
            
            // Fit content to show all data
            setTimeout(() => {
                if (this.chart) {
                    this.chart.timeScale().fitContent();
                }
            }, 100);
            
            console.log('Data loaded successfully');
            
        } catch (error) {
            console.error('Error loading data:', error);
        }
    }
    

    // Update crosshair information
    updateCrosshairInfo(param) {
        const crosshairInfo = document.getElementById('crosshairInfo');
        if (!crosshairInfo) return;
        
        if (param.time && this.candlestickSeries) {
            // Add null check for seriesPrices
            if (!param.seriesPrices) {
                crosshairInfo.textContent = 'Move cursor to see price info';
                return;
            }
            
            const data = param.seriesPrices.get(this.candlestickSeries);
            
            if (data) {
                // Format date and time properly
                const date = new Date(param.time * 1000);
                const formattedDate = date.toLocaleDateString();
                const formattedTime = date.toLocaleTimeString();
                crosshairInfo.textContent = `${formattedDate} ${formattedTime} | O: ${data.open} H: ${data.high} L: ${data.low} C: ${data.close}`;
            } else {
                crosshairInfo.textContent = 'Move cursor to see price info';
            }
        } else {
            crosshairInfo.textContent = 'Move cursor to see price info';
        }
    }
    
    
    // Start broker streaming
    async startBrokerStreamingDirect(symbol) {

        const token = localStorage.getItem("jwt");
        if (!token) {
            this.showNotification("Not logged in!", "error");
            window.location.href = "login.html";
            return;
        }
    
        this.currentSymbol = symbol;
        this.jwtToken = token;
    
        // Setup indicators
        if (typeof this.setupCustomIndicators === "function") {
            this.setupCustomIndicators();
        }

        
    
        // Connect to Socket.IO
        this.socket = io("http://localhost:5001", {
            transports: ['websocket'],
            auth: { token }
        });

    
    
        this.socket.on("connect", () => {
            console.log("Connected:", this.socket.id);
            document.getElementById("streamFromServer").style.display = "none";
            document.getElementById("stopSimulation").style.display = "inline-block";
    
            // Start server stream
            this.socket.emit("start_stream", {
                token,
                symbol,
                speed: this.streamingSpeed
            });
        });
    
        this.socket.on("candle", (row) => this.processStreamingRow(row));
    
        this.socket.on("end", () => {
            document.getElementById("streamFromServer").style.display = "inline-block";
            document.getElementById("stopSimulation").style.display = "none";
        });
    }
    

    async initSocketAndHandlers() {
        const token = localStorage.getItem("jwt");
        if (!token) {
            this.showNotification("Please login.", "error");
            window.location.href = "login.html";
            return;
        }
    
        this.jwtToken = token;
    
        // Create WebSocket connection
        this.socket = io("http://localhost:5001", {
            transports: ["websocket"],
            auth: { token }
        });
    
        this.socket.on("connect", () => {
            console.log("Connected:", this.socket.id);
        });
    
        // Each candle event will routed to processStreamingRow
        this.socket.on("candle", (row) => {
            this.routeCandleToProcess(row);
        });
    
        this.socket.on("disconnect", () => {
            this.showNotification("Disconnected from server", "warning");
        });
    
        this.socket.on("connect_error", (err) => {
            this.showNotification("Connection Error: " + err.message, "error");
        });
    }
    subscribeToSymbol(symbol) {
        if (!this.socket) return;
    
        this.currentSymbol = symbol;
    
        this.socket.emit("subscribe", {
            token: this.jwtToken,
            symbols: [symbol],
            speed: this.streamingSpeed
        });
    }
    
    subscribeSelectedSymbols() {
        const checkboxes = document.querySelectorAll("#stockList input[type='checkbox']:checked");
        const symbols = Array.from(checkboxes).map(cb => cb.value);
    
        if (!symbols.length) {
            this.showNotification("Select at least one stock", "info");
            return;
        }
    
        // FIRST SELECTED SYMBOL → display on main page
        const firstSymbol = symbols[0];
        this.currentSymbol = firstSymbol;
    
        const label = document.querySelector('.current-symbol');
        if (label) label.textContent = firstSymbol;
    
        // Remaining symbols open in new tabs
        const others = symbols.slice(1);
        others.forEach(sym => {
            window.open(`chart.html?symbol=${encodeURIComponent(sym)}`, "_blank");
        });
    
        document.getElementById("stockModal").classList.add("hidden");
    }
    
    

    unsubscribeSelectedSymbols() {
        const checkboxes = document.querySelectorAll("#stockList input[type='checkbox']:checked");
        const symbols = Array.from(checkboxes).map(cb => cb.value);
    
        if (!symbols.length) return;
    
        this.socket.emit("unsubscribe", { token: this.jwtToken, symbols });
    }
    


    routeCandleToProcess(row) {
        const symbol = row.symbol;
    
        // Ensure container for this symbol exists
        if (!this.charts) this.charts = {};
        if (!this.charts[symbol]) this.createChartForSymbol(symbol);
    
        // Save global refs
        const prevChartData = this.chartData;
        const prevSeries = this.candlestickSeries;
        const prevVolume = this.volumeSeries;
        const prevSymbol = this.currentSymbol;
    
        // Redirect global state to this symbol
        this.currentSymbol = symbol;
        this.chartData = this.charts[symbol].data;
        this.candlestickSeries = this.charts[symbol].series;
        this.volumeSeries = this.charts[symbol].volumeSeries;
    
        // Ensure headers are detected (one-time)
        if (!this.dynamicCsvHeader) {
            const standard = ["time","date","timestamp","open","high","low","close","volume","symbol","bs"];
            this.dynamicCsvHeader = Object.keys(row).filter(h => !standard.includes(h.toLowerCase()));
            if (this.dynamicCsvHeader.length > 0 && typeof this.setupCustomIndicators === "function") {
                this.setupCustomIndicators();
            }
        }
    
        // NOW call your original logic (indicators, labels, etc.)
        this.processStreamingRow(row);
    
        // Restore global state
        this.chartData = prevChartData;
        this.candlestickSeries = prevSeries;
        this.volumeSeries = prevVolume;
        this.currentSymbol = prevSymbol;
    }
    
    createChartForSymbol(symbol) {
        if (!this.charts) this.charts = {};
        if (this.charts[symbol]) return this.charts[symbol];
    
        const series = this.chart.addCandlestickSeries({
            title: symbol,
            upColor: "#26a69a",
            downColor: "#ef5350",
            wickUpColor: "#26a69a",
            wickDownColor: "#ef5350"
        });
    
        const volumeSeries = this.chart.addHistogramSeries({
            priceScaleId: 'volume',
            priceFormat: { type: 'volume' },
            scaleMargins: { top: 0.8, bottom: 0 }
        });
    
        const obj = {
            series,
            volumeSeries,
            data: []
        };
    
        this.charts[symbol] = obj;
        return obj;
    }
    
    
            togglePauseResume() {
                this.isPaused = !this.isPaused;
                const btn = document.getElementById('pauseResume');
            
                if (this.isPaused) {
                    btn.textContent = "▶ Resume";
            
                    // Pause CSV
                    if (this.csvStreamingInterval) {
                        clearInterval(this.csvStreamingInterval);
                        this.csvStreamingInterval = null;
                    }
            
                    // Pause WebSocket stream
                    if (this.socket) {
                        this.socket.emit("stop_stream");
                    }
            
                    console.log("⏸ Streaming paused");
            
                } else {
                    btn.textContent = "⏸ Pause";
                    console.log("▶ Streaming resumed");
            
                    // Resume CSV
                    if (this.csvFullData) {
                        this.csvStreamingInterval = setInterval(
                            () => this.streamNextTimescaleCandle(this.currentSymbol),
                            this.streamingSpeed
                        );
                    }
            
                    // Resume WebSocket
                    if (this.socket && this.jwtToken && this.currentSymbol) {
                        this.socket.emit("start_stream", { 
                            token: this.jwtToken, 
                            symbol: this.currentSymbol, 
                            speed: this.streamingSpeed 
                        });
                    }
                }
            }
            
    

// Process single row
processStreamingRow(rowData) {
    console.log('Processing row:', rowData);
    this.latestCandleFromServer = rowData;
    // Extract OHLCV data
    const candle = {
        time: this.convertToUnixSeconds(rowData.time || rowData.date || rowData.timestamp), 
        open: parseFloat(rowData.open),
        high: parseFloat(rowData.high),
        low: parseFloat(rowData.low),
        close: parseFloat(rowData.close),
        volume: parseFloat(rowData.volume) || 0,
        bs: rowData.bs !== undefined ? rowData.bs : null
        
    };
 

    
    
    // Extract custom indicator values (OP1, OP2, etc.)
    if (this.dynamicCsvHeader) {
        const standardColumns = ['time', 'date', 'timestamp', 'open', 'high', 'low', 'close', 'volume', 'bs'];
        
        this.dynamicCsvHeader.forEach(header => {
            // Check if this header is NOT a standard column
            if (!standardColumns.some(std => header.toLowerCase().includes(std.toLowerCase()))) {
                // This is a custom indicator column (OP1, OP2, etc.)
                const value = parseFloat(rowData[header]);
                candle[header] = !isNaN(value) ? value : null;
            }
        });
    }

    // color assign
    Object.keys(rowData).forEach(key => {
        if (key.endsWith("_color")) {
            candle[key] = rowData[key];   // pass through color to candle
        }
    });


    if (!this.dynamicCsvHeader || this.dynamicCsvHeader.length === 0) {

        const standard = ["time","open","high","low","close","volume","symbol","bs"];

        this.dynamicCsvHeader = Object.keys(rowData).filter(
            k => !standard.includes(k.toLowerCase())
        );

        this.createCustomIndicatorUI(this.dynamicCsvHeader);
    }

    
    // Add to chart data
    this.chartData.push(candle);
    
    // Update candlestick series
    if (this.candlestickSeries) {
        this.candlestickSeries.update(candle);
    }
    
    // Update volume series
    if (this.volumeSeries) {
        const volumeData = {
            time: candle.time,
            value: candle.volume,
            color: candle.close > candle.open
                ? (this.currentTheme === 'dark' ? 'rgba(38, 166, 154, 0.5)' : 'rgba(8, 153, 129, 0.5)')
                : (this.currentTheme === 'dark' ? 'rgba(239, 83, 80, 0.5)' : 'rgba(242, 54, 69, 0.5)')
        };
        this.volumeSeries.update(volumeData);
    }

    
    this.updateCustomIndicators(candle);
    
    // Update signal labels (BS)
    this.addSignalLabel(candle);
    
    // Update UI
    this.updateChartInfo();
    
    // Keep data manageable
    if (this.chartData.length > 1000) {
        this.chartData.shift();
    }

    
}

//  timezone conversion
convertToUnixSeconds(timestamp) {
    try {
        // If already Unix seconds, return it
        if (typeof timestamp === 'number') {
            return timestamp;
        }
        
        // If it's a string like "2025-01-01 09:00:00" (without timezone)
        if (typeof timestamp === 'string') {
            // Remove any timezone info if present
            const cleanTimestamp = timestamp.split('+')[0].split('Z')[0];
            
            // Parse as local time 
            const date = new Date(cleanTimestamp.replace(' ', 'T'));
            
            // Return Unix seconds (treat as local IST)
            return Math.floor(date.getTime() / 1000);
        }
        
        return Math.floor(Date.now() / 1000);
    } catch (e) {
        console.error('Timestamp parse error:', timestamp, e);
        return Math.floor(Date.now() / 1000);
    }
}

getHHMMFromUnix(timeSec) {
    const d = new Date(timeSec * 1000);
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

isTimeInRange(hhmm, start, end) {
    // Convert HH:MM → number, example: "09:15" → 915
    const t = Number(hhmm.replace(":", ""));
    const s = Number(start.replace(":", ""));
    const e = Number(end.replace(":", ""));

    return t >= s && t < e;
}

getRangeColor(hhmm, defaultColor) {
    let chosen = defaultColor;

    this.indicatorColorRanges.forEach(r => {
        if (this.isTimeInRange(hhmm, r.start, r.end)) {
            chosen = r.color;
        }
    });

    return chosen;
}

// Add signal label to chart when bs=0 or bs=1
addSignalLabel(candle) {
    if (!candle.bs) return;

    const reason = candle.bs_reason || (
        candle.bs === 1 ? "Buy at 17990. Target T1, 18,000. Target T2, 18,100. Target T3, 18,200. Stop loss, 17,958" : "Sell signal"
    );

    const anchorPrice = candle.high + (candle.high * 0.01); // place above high
    const time = candle.time;

    // remove old box for same timestamp
    document.querySelectorAll(`.sticky-signal[data-time="${time}"]`)
        .forEach(el => el.remove());

    const box = document.createElement("div");
    box.className = `sticky-signal ${candle.bs === 1 ? "sticky-buy" : "sticky-sell"}`;
    box.dataset.time = time;

    box.innerHTML = `
        <div class="sticky-title">${candle.bs === 1 ? "BUY" : "SELL"}</div>
        <div class="sticky-reason">${reason}</div>
    `;

    document.body.appendChild(box);

    const chartEl = document.getElementById("chart");

    const updatePos = () => {
        const chartRect = chartEl.getBoundingClientRect();

        const tx = this.chart.timeScale().timeToCoordinate(time);
        const py = this.candlestickSeries.priceToCoordinate(anchorPrice);

        if (tx === null || py === null) {
            box.style.display = "none";
            return;
        }

        const pageX = chartRect.left + window.scrollX + tx;
        const pageY = chartRect.top + window.scrollY + py;

        // measure box after render
        const bRect = box.getBoundingClientRect();

        // place the box ABOVE the candle
        let left = pageX - bRect.width / 2;
        let top  = pageY - bRect.height - 14;  // 14px gives room for arrow

        // keep inside chart horizontally
        if (left < chartRect.left + 5) left = chartRect.left + 5;
        if (left + bRect.width > chartRect.right - 5)
            left = chartRect.right - bRect.width - 5;

        // keep inside top boundary
        if (top < chartRect.top + 5)
            top = chartRect.top + 5;

        box.style.left = `${left}px`;
        box.style.top  = `${top}px`;
    };

    updatePos();

    this.chart.timeScale().subscribeVisibleTimeRangeChange(updatePos);
    this.chart.subscribeCrosshairMove(updatePos);
    window.addEventListener("resize", updatePos);
}







clearSignalTags() {
    if (!this.htmlSignalTags) return;
    this.htmlSignalTags.forEach(t => {
        try {
            if (t.unsubVisibleRange) t.unsubVisibleRange();
            if (t.unsubCrosshair) t.unsubCrosshair();
            if (t.resizeHandler) window.removeEventListener('resize', t.resizeHandler);
            if (t.el && t.el.parentNode) t.el.parentNode.removeChild(t.el);
        } catch (e) {}
    });
    this.htmlSignalTags = [];
}

// Setup custom indicators from CSV headers

setupCustomIndicators() {
    if (!this.dynamicCsvHeader || this.dynamicCsvHeader.length === 0) {
        console.log('No custom indicators available');
        return;
    }
    const indicatorsOnly = this.dynamicCsvHeader.filter(algo => 
        algo.toLowerCase() !== 'bs' &&
        !algo.endsWith('_color')    // ignore color fields
    );
    
    
    console.log('Setting up indicators:', indicatorsOnly);
    
    // Create UI for each algo
    this.createCustomIndicatorUI(indicatorsOnly);
}

// Create UI for custom indicators
createCustomIndicatorUI(customColumns) {
    const container = document.querySelector('.indicators-list');
    if (!container) return;

    // Remove previous UI
    document.querySelectorAll('.dynamic-indicator-item').forEach(el => el.remove());

    customColumns.forEach((column, index) => {
        // Ignore *_color columns
        if (column.endsWith("_color")) return;

        const dbColorField = column + "_color";
        let indColor = null;

        // ⭐ PRIORITY #1 — read color directly from latest rowData
        if (this.latestCandleFromServer && this.latestCandleFromServer[dbColorField]) {
            indColor = this.latestCandleFromServer[dbColorField];
        }

        // ⭐ PRIORITY #2 — read color from any existing candle
        if (!indColor && this.chartData.length > 0) {
            for (let c of this.chartData) {
                if (c[dbColorField]) {
                    indColor = c[dbColorField];
                    break;
                }
            }
        }

        // ⭐ FINAL FALLBACK (ONLY if DB color missing)
        const fallbackColors = ['#FF6B35', '#4CAF50', '#2196F3', '#9C27B0'];
        indColor = indColor || fallbackColors[index % fallbackColors.length];

        // Build UI element
        const div = document.createElement('div');
        div.className = 'indicator-item dynamic-indicator-item';
        div.innerHTML = `
            <label class="indicator-checkbox">
                <input type="checkbox" id="${column}" data-indicator="${column}">
                <span class="checkmark"></span>
                ${column.toUpperCase()}
            </label>
            <div class="indicator-color" style="background-color: ${indColor}"></div>
        `;
        container.appendChild(div);

        // Link checkbox behavior
        const checkbox = div.querySelector('input');
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                this.enableCustomIndicator(column, indColor);
            } else {
                this.disableCustomIndicator(column);
            }
        });
    });
}


// Enable custom indicator
enableCustomIndicator(column, color) {
    if (!this.customIndicators) this.customIndicators = {};
    if (!this.customIndicators[column]) {
        this.customIndicators[column] = {
            enabled: false,
            series: null,
            defaultColor: color
        };
    }

    this.customIndicators[column].enabled = true;

    if (!this.customIndicators[column].series) {
        this.customIndicators[column].series = this.chart.addLineSeries({
            title: column.toUpperCase(),
            lineWidth: 2,
            priceScaleId: ''
        });

        const dbColorField = column + "_color";

        // Build per-point data using DB color when available
        const raw = this.chartData.filter(c => c[column] != null && !isNaN(c[column]));

        const colored = raw.map(c => {
            const hhmm = this.getHHMMFromUnix(c.time);
            // Prefer DB color from the candle if present, otherwise use provided color
            const pointColor = (c[dbColorField] && typeof c[dbColorField] === 'string')
                ? c[dbColorField]
                : color;

            return {
                time: c.time,
                value: c[column],
                color: this.getRangeColor(hhmm, pointColor)
            };
        });

        this.customIndicators[column].series.setData(colored);
    }

    this.showNotification(`${column.toUpperCase()} indicator added`, 'success');
}


// Disable custom indicator
disableCustomIndicator(column) {
    // Check if customIndicators and indicator exist before accessing
    if (!this.customIndicators || !this.customIndicators[column]) {
        return;
    }
    
    if (this.customIndicators[column].series) {
        this.chart.removeSeries(this.customIndicators[column].series);
        this.customIndicators[column].series = null;
    }
    
    this.customIndicators[column].enabled = false;
    this.showNotification(`${column.toUpperCase()} indicator removed`, 'info');
}


// Called by processStreamingRow on every new candle
updateCustomIndicators(candle) {
    Object.entries(this.customIndicators).forEach(([column, cfg]) => {
        if (!cfg.enabled || !cfg.series) return;

        const value = candle[column];
        if (value == null || isNaN(value)) return;

        const hhmm = this.getHHMMFromUnix(candle.time);
        // Look for DB color if present
        let dbColorField = column + "_color";
        let useColor = candle[dbColorField] || cfg.defaultColor;

        const barColor = this.getRangeColor(hhmm, useColor);


        cfg.series.update({
            time: candle.time,
            value: value,
            color: barColor
        });
        // recolor entire series when we detect a DB color for the first time
        if (!cfg._dbColorSeen && candle[dbColorField]) {
            cfg._dbColorSeen = true;
            // rebuild existing series with per-point colors (cheap for moderate data sizes)
            const existing = this.chartData.filter(x => x[column] != null && !isNaN(x[column]));
            const rebuilt = existing.map(c => {
                const hhmm = this.getHHMMFromUnix(c.time);
                const pc = c[dbColorField] || cfg.defaultColor;
                return { time: c.time, value: c[column], color: this.getRangeColor(hhmm, pc) };
            });
            try { cfg.series.setData(rebuilt); } catch(e) { console.warn('rebuild series failed', e); }
        }

    });
}

// Stop broker streaming
stopBrokerStreaming() {
    // stop any csv streaming interval
    if (this.csvStreamingInterval) {
        clearInterval(this.csvStreamingInterval);
        this.csvStreamingInterval = null;
    }

    // stop server stream interval if any
    if (this.serverStreamInterval) {
        clearInterval(this.serverStreamInterval);
        this.serverStreamInterval = null;
    }

    // Disconnect the socket entirely
    if (this.socket) {
        try { this.socket.emit('stop_stream'); } catch(e) {}
        try { this.socket.disconnect(); } catch(e) {}
        this.socket = null;
    }

    // Reset streaming flags
    this.isStreamingCsv = false;
    this.isStreamingFromServer = false;

    // Update UI buttons
    const streamBtn = document.getElementById('streamFromServer');
    const stopBtn = document.getElementById('stopSimulation');
    

    if (streamBtn) streamBtn.style.display = 'inline-block';
    if (stopBtn) stopBtn.style.display = 'none';
    

    this.showNotification('Simulation stopped and disconnected', 'info');
    console.log('Broker streaming fully stopped and socket disconnected');
}

    // Update chart info display
    updateChartInfo() {
        const symbolElement = document.querySelector('.current-symbol');
        const priceElement = document.querySelector('.current-price');
        const changeElement = document.querySelector('.price-change');
        
        if (!symbolElement || !priceElement || !changeElement) return;

        if (!this.isRealtime || !this.currentSymbol) {
            // Hide symbol and price for CSV/Broker modes
            symbolElement.textContent = '';
            priceElement.textContent = '';
            changeElement.textContent = '';
            changeElement.className = 'price-change';
            return;
        }
        
        symbolElement.textContent = this.currentSymbol;
        
        if (this.chartData.length === 0) {
            // No data available
            priceElement.textContent = '$0.00';
            changeElement.textContent = '+0.00 (0.00%)';
            changeElement.className = 'price-change';
            return;
        }
        
        const lastCandle = this.chartData[this.chartData.length - 1];
        const prevCandle = this.chartData.length > 1 ? this.chartData[this.chartData.length - 2] : null;
        
        priceElement.textContent = '$' + lastCandle.close.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        
        if (prevCandle) {
            const change = lastCandle.close - prevCandle.close;
            const changePercent = (change / prevCandle.close * 100).toFixed(2);
            const changeText = (change > 0 ? '+' : '') + change.toFixed(2) + ' (' + changePercent + '%)';
            changeElement.textContent = changeText;
            changeElement.className = 'price-change ' + (change > 0 ? 'positive' : 'negative');
        } else {
            changeElement.textContent = '+0.00 (0.00%)';
            changeElement.className = 'price-change';
        }
    }

    getCustomIndicatorColumns(headers) {
        const standard = ['date','time','timestamp','open','high','low','close','volume','vol'];
        return headers.filter(h => !standard.some(std => h.includes(std)));
      }
      
    
    
    // Add this new method after updateChartInfo()
    startRealTimeUIUpdates() {
        clearInterval(this.realTimeUIInterval);
        this.updateWatchlistPrices();
        this.realTimeUIInterval = setInterval(() => this.updateWatchlistPrices(), 30000);
      }
      
    
    
    
    stopRealTimeUIUpdates() 
    {
        if (this.realTimeUIInterval) {
            clearInterval(this.realTimeUIInterval);
            this.realTimeUIInterval = null;
        }
    }

    // Add this method after updateChartInfo()
    async updateWatchlistPrices() {
        document.querySelectorAll('.watchlist-item').forEach(async item => {
          const sym = item.querySelector('.symbol').textContent.trim();
          try {
            const { price, change24h } = await this.fetchLiveQuote(sym);
            item.querySelector('.price').textContent = '$'+price.toFixed(2);
            const ch = item.querySelector('.change');
            ch.textContent = `${change24h>0?'+':''}${change24h.toFixed(2)}%`;
            ch.className = `change ${change24h>0?'change-positive':'change-negative'}`;
          } catch {}
        });
      }
      
      
      
    async initializeWatchlistRealData() {
        console.log('Initializing watchlist with real-time data...');
        
        this.watchlistRealData = {};
        
        // Get all symbols from watchlist
        const watchlistItems = document.querySelectorAll('.watchlist-item .symbol');
        const symbols = Array.from(watchlistItems).map(item => item.textContent);
        
        // Fetch initial real data for all symbols
        for (const symbol of symbols) {
            try {
                const realTimeData = await this.fetchRealTimePrice(symbol);
                this.watchlistRealData[symbol] = {
                    currentPrice: realTimeData.price,
                    previousPrice: realTimeData.price,
                    change24h: realTimeData.change24h,
                    lastUpdate: Date.now()
                };
                console.log(`Initialized ${symbol}: $${realTimeData.price}`);
            } catch (error) {
                console.error(`Error initializing ${symbol}:`, error);
                // Use fallback data
                const fallbackData = this.getFallbackPrice(symbol);
                this.watchlistRealData[symbol] = {
                    currentPrice: fallbackData.price,
                    previousPrice: fallbackData.price,
                    change24h: fallbackData.change24h,
                    lastUpdate: Date.now()
                };
            }
        }
        
        console.log('Watchlist initialization complete');
    }

    updateWatchlistPricesFallback(item, symbol) {
        const priceElement = item.querySelector('.price');
        const changeElement = item.querySelector('.change');
        
        if (!this.watchlistRealData) {
            this.watchlistRealData = {};
        }
        
        if (!this.watchlistRealData[symbol]) {
            const fallbackData = this.getFallbackPrice(symbol);
            this.watchlistRealData[symbol] = {
                currentPrice: fallbackData.price,
                previousPrice: fallbackData.price,
                change24h: fallbackData.change24h,
                lastUpdate: Date.now()
            };
        }
        
        const data = this.watchlistRealData[symbol];
        
        // Small random movement for fallback
        const volatility = symbol.includes('USD') ? 0.001 : 0.002;
        const change = (Math.random() - 0.5) * 2 * volatility * data.currentPrice;
        
        data.previousPrice = data.currentPrice;
        data.currentPrice = Math.max(data.currentPrice + change, 0.01);
        data.lastUpdate = Date.now();
        
        // Update UI
        priceElement.textContent = '$' + data.currentPrice.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        
        const priceChange = data.currentPrice - data.previousPrice;
        const changeText = (priceChange > 0 ? '+' : '') + priceChange.toFixed(2);
        
        changeElement.textContent = changeText;
        changeElement.className = 'change ' + (priceChange > 0 ? 'change-positive' : 'change-negative');
    }
    
    // Check if local server is running
async checkServerStatus() {
    try {
        const response = await fetch(`${this.serverUrl}/api/status`);
        if (response.ok) {
            const data = await response.json();
            return data.status === 'running';
        }
        return false;
    } catch (error) {
        return false;
    }
}

// Get list of available CSV files from server
async getServerCsvFiles() {
    try {
        const response = await fetch(`${this.serverUrl}/api/csv-files`);
        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}`);
        }
        const data = await response.json();
        return data.files || [];
    } catch (error) {
        console.error('Error fetching CSV files:', error);
        throw error;
    }
}

// Existing file‐upload listener calls this:
handleCsvData(csvText) {
    try {
        // 1. Parse CSV text into array of candles
        const data = this.parseCsvData(csvText);
        if (!data.length) throw new Error('No data');

        // 2. Initialize CSV streaming state
        this.csvFullData = data;
        this.csvStreamIndex = 0;
        this.isStreamingCsv = true;

        // 3. Clear existing chart and load initial state
        this.chartData = [];
        this.loadData();
        this.updateChartInfo();

        // 4. Start the row-by-row simulation
        this.startCsvStreaming();

    } catch (e) {
        console.error('CSV handling error:', e);
        this.showNotification(`CSV error: ${e.message}`, 'error');
    }
}



// Add these methods to your TradingViewApp class

startServerStreaming(filename) {
    console.log('Starting server streaming for:', filename);
    
    // Clear any existing interval
    if (this.serverStreamInterval) {
        clearInterval(this.serverStreamInterval);
    }
    
    this.isStreamingFromServer = true;
    this.serverStreamIndex = 0;
    
    // Update UI
    const dataMode = document.getElementById('dataMode');
    if (dataMode) {
        dataMode.textContent = `Streaming: ${filename}`;
    }
    
    // Show/hide buttons
    const streamBtn = document.getElementById('streamFromServer');
    const stopBtn = document.getElementById('stopSimulation');
    if (streamBtn) streamBtn.style.display = 'none';
    if (stopBtn) stopBtn.style.display = 'inline-block';
    
    // Stream immediately and then continue
    this.streamNextServerCandle();
    this.serverStreamInterval = setInterval(() => {
        this.streamNextServerCandle();
    }, 1000); // 1 second per candle for faster demo
}

streamNextServerCandle() {
    if (!this.serverData || this.serverStreamIndex >= this.serverData.length) {
        this.stopServerStreaming();
        this.showNotification('Server streaming completed!', 'success');
        return;
    }
    
    const nextCandle = this.serverData[this.serverStreamIndex];
    console.log(`Streaming candle ${this.serverStreamIndex + 1}/${this.serverData.length}`);
    
    // Add to chart
    this.chartData.push(nextCandle);
    
    // Update chart series
    if (this.candlestickSeries) {
        this.candlestickSeries.update(nextCandle);
    }
    
    if (this.volumeSeries) {
        this.volumeSeries.update({
            time: nextCandle.time,
            value: nextCandle.volume,
            color: nextCandle.close >= nextCandle.open ? '#26a69a80' : '#ef535080'
        });
    }
    
    // Update indicators if any
    this.updateStreamingIndicators(nextCandle);
    
    this.updateChartInfo();
    this.serverStreamIndex++;
    
    // Auto-fit every 10 candles
    if (this.serverStreamIndex % 10 === 0 && this.chart) {
        this.chart.timeScale().fitContent();
    }
}

stopServerStreaming() {
    if (this.serverStreamInterval) {
        clearInterval(this.serverStreamInterval);
        this.serverStreamInterval = null;
    }
    
    this.isStreamingFromServer = false;
    
    // Update UI
    const dataMode = document.getElementById('dataMode');
    if (dataMode) {
        dataMode.textContent = 'Historical Data';
    }
    
    // Show/hide buttons
    const streamBtn = document.getElementById('streamFromServer');
    const stopBtn = document.getElementById('stopSimulation');
    if (streamBtn) streamBtn.style.display = 'inline-block';
    if (stopBtn) stopBtn.style.display = 'none';
    
    console.log('Server streaming stopped');
}

// Update the stopAllSimulations method
stopAllSimulations() {

    // Stop CSV/BROKER simulation interval
    if (this.csvStreamingInterval) {
        clearInterval(this.csvStreamingInterval);
        this.csvStreamingInterval = null;
    }
    this.isStreamingCsv = false;

    // Stop server stream interval (if used)
    if (this.serverStreamInterval) {
        clearInterval(this.serverStreamInterval);
        this.serverStreamInterval = null;
    }
    this.isServerStreaming = false;

    // Turn off live mode if active
    if (this.isRealtime) {
        this.isRealtime = false;
    }

    const streamBtn = document.getElementById('streamFromServer');
    const stopBtn = document.getElementById('stopSimulation');
    if (streamBtn) streamBtn.style.display = "inline-block";
    if (stopBtn) stopBtn.style.display = "none";

    console.log("Simulation stopped successfully");
}



// Stream the next candle from server data
streamNextServerCandle() {
    if (!this.serverData || this.serverStreamIndex >= this.serverData.length) {
        // Finished streaming all data
        this.stopServerStreaming();
        this.showNotification('Server streaming completed!', 'success');
        return;
    }
    
    // Get next candle from server data
    const nextCandle = this.serverData[this.serverStreamIndex];
    console.log(`Streaming candle ${this.serverStreamIndex + 1}/${this.serverData.length}`, nextCandle);
    
    // Add to chart data
    this.chartData.push(nextCandle);
    
    // Update chart series
    if (this.candlestickSeries) {
        this.candlestickSeries.update(nextCandle);
    }
    
    if (this.volumeSeries) {
        this.volumeSeries.update({
            time: nextCandle.time,
            value: nextCandle.volume,
            color: nextCandle.close >= nextCandle.open ? 
                (this.currentTheme === 'dark' ? '#26a69a80' : '#08998180') : 
                (this.currentTheme === 'dark' ? '#ef535080' : '#f2364580')
        });
    }
    
    // Update active dynamic indicators with new data
    this.updateStreamingIndicators(nextCandle);
    
    // Update UI
    this.updateChartInfo();
    this.serverStreamIndex++;
    
    // Auto-fit content occasionally
    if (this.serverStreamIndex % 10 === 0 && this.chart) {
        this.chart.timeScale().fitContent();
    }
}

// Stop server streaming
stopServerStreaming() {
    if (this.serverStreamInterval) {
        clearInterval(this.serverStreamInterval);
        this.serverStreamInterval = null;
    }
    
    this.isStreamingFromServer = false;
    
    // Update UI
    const dataMode = document.getElementById('dataMode');
    if (dataMode) {
        dataMode.textContent = 'Historical Data';
    }
    
    // Update buttons
    this.updateStreamingButtons(false);
    
    console.log('Server streaming stopped');
}


  

// Add this method to your TradingViewApp class (around line 400-500)
updateStreamingButtons(isStreaming) {
    const streamBtn = document.getElementById('streamFromServer');
    const stopBtn = document.getElementById('stopSimulation');
    
    if (streamBtn && stopBtn) {
        if (isStreaming) {
            streamBtn.style.display = 'none';
            stopBtn.style.display = 'inline-block';
        } else {
            streamBtn.style.display = 'inline-block';
            stopBtn.style.display = 'none';
        }
    }
}

// Update the existing stopAllSimulations method
stopAllSimulations() {
    
    // Stop server streaming
    if (this.isStreamingFromServer) {
        this.stopServerStreaming();
    }
    
    
    // Stop live mode
    if (this.isRealtime) {
        this.toggleRealtime();
    }
    
    this.showNotification('All streaming stopped', 'info');
}

async loadFullHistory(symbol) {
    document.getElementById("dataMode").innerText = "📦 Loading Full History...";

    const res = await fetch(`http://localhost:5001/api/load-history?symbol=${symbol}`);
    const json = await res.json();
    if (!json.success) return;

    // Save raw candles for timeframe switching
    this.originalCandles = json.data;

this.originalCandles = json.data.map(c => ({ ...c, time: this.convertToUnixSeconds(c.time) }));
this.chartData = this.originalCandles.slice();


//variable column
const first = json.data[0];
const standard = ["time","open","high","low","close","volume","symbol","bs"];

this.dynamicCsvHeader = Object.keys(first).filter(
    k => !standard.includes(k.toLowerCase())
);

this.createCustomIndicatorUI(this.dynamicCsvHeader);

await this.changeTimeframe("5m");


document.getElementById("dataMode").innerText = "📊 Full History Loaded";
}

setActiveTimeframeButton(tf) {
    document.querySelectorAll('.btn-timeframe').forEach(btn => {
        if (btn.dataset.timeframe === tf) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}


applyTimeframe(tf) {
    this.currentTimeframe = tf;
    this.setActiveTimeframeButton(tf);

    const source = this.originalCandles || [];
    const aggregated = this.aggregateData(tf, source);

    this.candlestickSeries.setData(aggregated);

    if (this.volumeVisible) this.updateVolume(aggregated);

    this.updateCandleSpacing(tf);

    this.applyTradingViewTimeScale(tf);

    this.chart.timeScale().fitContent();
}


aggregateData(tf, candles) {
    const interval = this.timeframeMap[tf];
    if (!interval) return candles;

    const result = [];
    let bucket = null;
    let bucketEnd = 0;

    candles.forEach(c => {
        const t = c.time;

        if (!bucket || t >= bucketEnd) {
            bucketEnd = t + interval;
            bucket = { ...c };
            result.push(bucket);
        } else {
            bucket.high = Math.max(bucket.high, c.high);
            bucket.low = Math.min(bucket.low, c.low);
            bucket.close = c.close;
            bucket.volume += c.volume;
        }
    });

    return result;
}


    // Setup all event listeners
    setupEventListeners() {
        console.log('Setting up event listeners...');
        
     // Stream from server button
     // Broker button
    const brokerBtn = document.getElementById('streamFromServer');
    if (brokerBtn) {
        brokerBtn.addEventListener('click', () => {
            console.log('Broker button clicked');
            this.startBrokerStreamingDirect();
            document.getElementById("streamFromServer").style.display = "none";
            document.getElementById("stopSimulation").style.display = "inline-block";
        });
    }

    const stopBtn = document.getElementById('stopSimulation');
    if (stopBtn) {
        stopBtn.addEventListener('click', () => {
            this.stopBrokerStreaming();
        });
    }


        //time frame changer
        document.querySelectorAll('.btn-timeframe').forEach(btn => {
            btn.addEventListener('click', () => {
                const tf = btn.dataset.timeframe;
                this.applyTimeframe(tf);
            });
        });

        // CSV upload
        const csvUpload = document.getElementById('csvUpload');
        if (csvUpload) {
            csvUpload.addEventListener('change', (e) => {
                console.log('CSV upload triggered');
                this.handleCsvUpload(e);
            });
        }

        document.getElementById('csvUpload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    this.loadCsvData(text);
    
  });


        // File upload button
        const uploadButton = document.querySelector('button[onclick*="csvUpload"]');
        if (uploadButton) {
            uploadButton.onclick = () => {
                console.log('Upload button clicked');
                document.getElementById('csvUpload').click();
            };
        }

        // Realtime toggle
        const toggleRealtime = document.getElementById('toggleRealtime');
        if (toggleRealtime) {
            toggleRealtime.addEventListener('click', async () => {  
                console.log('Realtime toggle clicked');
                await this.toggleRealtime();  
            });
        }


        // Auto scale
        const autoScale = document.getElementById('autoScale');
        if (autoScale) {
            autoScale.addEventListener('click', () => {
                console.log('Auto scale clicked');
                if (this.chart) {
                    this.chart.timeScale().fitContent();
                    this.showNotification('Chart auto-scaled', 'success');
                }
            });
        }

        // Export chart
        const exportChart = document.getElementById('exportChart');
        if (exportChart) {
            exportChart.addEventListener('click', () => {
                console.log('Export chart clicked');
                this.exportChart();
            });
        }

        // Timeframe buttons
        document.querySelectorAll('.btn-timeframe').forEach(btn => {
            btn.addEventListener('click', (e) => {
                console.log('Timeframe button clicked:', e.target.dataset.timeframe);
                this.changeTimeframe(e.target.dataset.timeframe);
            });
        });

        // Chart style buttons
        document.querySelectorAll('.chart-style-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                console.log('Chart style button clicked:', e.target.dataset.style);
                this.changeChartStyle(e.target.dataset.style);
            });
        });

        // Drawing tools
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                console.log('Drawing tool clicked:', e.currentTarget.dataset.tool);
                this.selectDrawingTool(e.currentTarget.dataset.tool);
            });
        });

        // Clear drawings
        const clearDrawings = document.getElementById('clearDrawings');
        if (clearDrawings) {
            clearDrawings.addEventListener('click', () => {
                console.log('Clear drawings clicked');
                this.clearDrawings();
            });
        }

        // Indicators
        document.querySelectorAll('input[data-indicator]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                console.log('Indicator toggled:', e.target.dataset.indicator, e.target.checked);
                this.updateIndicator(e.target.dataset.indicator, e.target.checked);
            });
        });

        // Symbol selector
        // Symbol selector - Replace the existing symbolSelect event listener with this:
        const symbolSelect = document.getElementById('symbolSelect');
        if (symbolSelect) {
            symbolSelect.addEventListener('change', async (e) => {
                console.log('Symbol changed to:', e.target.value);
                await this.changeSymbol(e.target.value);
            });

            // Set initial dropdown value to match current symbol
            symbolSelect.value = this.currentSymbol;
        }

        // Bottom panel toggle
        const toggleBottomPanel = document.getElementById('toggleBottomPanel');
        if (toggleBottomPanel) {
            toggleBottomPanel.addEventListener('click', () => {
                console.log('Bottom panel toggle clicked');
                this.toggleBottomPanel();
            });
        }
        
        console.log('Event listeners set up complete');
    }



    // Handle CSV file upload
    async handleCsvUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
    
        this.showNotification('Processing CSV file...', 'info');
    
        try {
            const text = await file.text();
            const data = this.parseCsvData(text);
            
            if (data.length === 0) throw new Error('No valid data found in CSV file');
    
            // Store full CSV data but don't display yet
            this.csvFullData = data;
            this.csvData = [...data]; // Keep original reference
            
            // Initialize with empty chart
            this.chartData = [];
            this.csvStreamIndex = 0;
            
            // If currently in live mode, stop it
            if (this.isRealtime) await this.toggleRealtime();
            
            // Clear chart and start streaming
            this.loadData(); // This will show empty chart initially
            this.updateChartInfo();
            
            // Start CSV streaming
            this.startCsvStreaming();
            
            const customCount = this.availableCustomIndicators.length;
            
            
        } catch (error) {
            console.error('CSV upload error:', error);
            this.showNotification(`Error loading CSV: ${error.message}`, 'error');
        }
    }

     


updateCustomIndicators(rowRaw) {
  this.indicatorKeys.forEach(key => {
    const val = parseFloat(rowRaw[key]);
    if (!this.indicators[key]) {
      this.indicators[key] = this.chart.addLineSeries({
        title: key,
        lineWidth: 2,
        // use color assignment, e.g. from a color palette or fixed map
      });
    }
    this.indicators[key].update({ time: rowRaw.time, value: val });
  });

  // Also update standard SMA indicators if enabled
  ['20', '50'].forEach(period => {
    const key = `sma${period}`;
    if (this.indicators[key]) {
      const smaData = this.calculateSMA(this.chartData, parseInt(period));
      if (smaData.length > 0) {
        this.indicators[key].update(smaData[smaData.length - 1]);
      }
    }
  });
}

    // Start streaming CSV data like live data
startCsvStreaming() {
    console.log('Starting CSV data streaming...');
    
    if (this.csvStreamingInterval) {
        clearInterval(this.csvStreamingInterval);
    }
    
    this.isStreamingCsv = true;
    this.updateStreamingButtons(true);

    this.csvStreamIndex = 0;
    
    // Update UI to show streaming mode
    const dataMode = document.getElementById('dataMode');
    if (dataMode) dataMode.textContent = '📊 Streaming CSV Data';
    
    // Stream first candle immediately
    this.streamNextCsvCandle();
    
    // Continue streaming every X seconds
    this.csvStreamingInterval = setInterval(() => {
        this.streamNextCsvCandle();
    }, this.streamingSpeed);
    
    //this.showNotification('CSV streaming started', 'info');
}

// Stream the next candle from CSV data
streamNextCsvCandle() {
    if (!this.csvFullData || this.csvStreamIndex >= this.csvFullData.length) {
        // Finished streaming all data
        this.stopCsvStreaming();
        this.showNotification('CSV streaming completed!', 'success');
        return;
    }
    
    // Get next candle from CSV
    const nextCandle = this.csvFullData[this.csvStreamIndex];
    console.log(`Streaming candle ${this.csvStreamIndex + 1}/${this.csvFullData.length}:`, nextCandle);
    
    // Add to chart data
    this.chartData.push(nextCandle);
    
    // Update chart series
    if (this.candlestickSeries) {
        this.candlestickSeries.update(nextCandle);
    }
    
    if (this.volumeSeries) {
        this.volumeSeries.update({
            time: nextCandle.time,
            value: nextCandle.volume,
            color: nextCandle.close >= nextCandle.open
                ? (this.currentTheme === 'dark' ? '#26a69a80' : '#08998180')
                : (this.currentTheme === 'dark' ? '#ef535080' : '#f2364580')
        });
    }
    
    // Update active dynamic indicators with new data
    this.updateStreamingIndicators(nextCandle);
    
    // Update UI
    this.updateChartInfo();
    
    this.csvStreamIndex++;
}

// Update dynamic indicators during streaming
updateStreamingIndicators(newCandle) {
    this.availableCustomIndicators.forEach(indicatorName => {
        if (this.indicators[indicatorName] && newCandle[indicatorName] != null) {
            const newPoint = {
                time: newCandle.time,
                value: parseFloat(newCandle[indicatorName])
            };
            
            try {
                this.indicators[indicatorName].update(newPoint);
            } catch (error) {
                console.error(`Error updating ${indicatorName} indicator:`, error);
            }
        }
    });
}


// Call whenever symbol or prices update
updateSymbolDisplay() {
    document.querySelector('.current-symbol').textContent = this.currentSymbol;
  }
  
  // Update symbol price display
updateSymbolPrice() {
    const priceElement = document.querySelector('.current-price');
    const changeElement = document.querySelector('.price-change');
    
    if (!priceElement || !changeElement) return;
    
    const data = this.livePriceCache[this.currentSymbol];
    if (!data) {
        priceElement.textContent = '$0.00';
        changeElement.textContent = '+0.00 (0.00%)';
        changeElement.className = 'price-change';
        return;
    }
    
    priceElement.textContent = `$${data.price.toFixed(2)}`;
    
    const changeText = data.change24h >= 0 ? 
        `+${data.change24h.toFixed(2)}%` : 
        `${data.change24h.toFixed(2)}%`;
    
    changeElement.textContent = changeText;
    changeElement.className = `price-change ${data.change24h >= 0 ? 'positive' : 'negative'}`;
}

    

// In updateDynamicIndicatorsUI(), use normalized names for IDs:
updateDynamicIndicatorsUI(customCols) {
    document.querySelectorAll('.dynamic-indicator-item').forEach(e=>e.remove());
    const container = document.querySelector('.indicators-list');
    if (!container) return;
    
    const colors = [
        '#FF6B35', '#4CAF50', '#2196F3', '#9C27B0', '#FF9800',
        '#E91E63', '#00BCD4', '#8BC34A', '#FFC107', '#795548',
        '#607D8B', '#F44336', '#3F51B5', '#009688', '#CDDC39',
        '#FF5722', '#9E9E9E', '#673AB7', '#03DAC6', '#FFAB00'
    ];  
    customCols.forEach((col, i) => {
        const div = document.createElement('div');
        div.className = 'indicator-item dynamic-indicator-item';
        div.innerHTML = `
          <label class="indicator-checkbox">
            <input type="checkbox" id="${col}" data-indicator="${col}">
            <span class="checkmark"></span>${col.toUpperCase()}
          </label>
          <div class="indicator-color" style="background-color:${colors[i%colors.length]}"></div>`;
        container.appendChild(div);
        
        // Add/remove using the identical 'col' key
        div.querySelector('input').addEventListener('change', e => {
            if (e.target.checked) this.addDynamicIndicator(col, colors[i%colors.length]);
            else this.removeIndicator(col);
        });
    });
}

    // Toggle realtime mode
    async toggleRealtime() {
        if (this.isStreamingCsv) {
            this.stopCsvStreaming();
        }
        this.isRealtime = !this.isRealtime;
        if (this.isRealtime && !this.currentSymbol) {
            this.currentSymbol = 'AAPL'; // Default symbol only when going live
          }
          this.updateChartInfo();
        const button = document.getElementById('toggleRealtime');
        const dataMode = document.getElementById('dataMode');
        
        if (this.isRealtime) {
            // Switching to LIVE mode
            if (button) {
                button.textContent = '⏹ Stop Live';
                button.classList.add('btn--primary');
                button.classList.remove('btn--secondary');
            }
            if (dataMode) dataMode.textContent = '🟢 Live Data';
            
            // Generate live data starting from current CSV data or fallback
            if (this.csvData && this.csvData.length > 0) {
                // Continue from last CSV data point
                const lastCsvCandle = this.csvData[this.csvData.length - 1];
                this.chartData = [...this.csvData]; // Start with CSV data
                
                console.log('Starting live mode from CSV data endpoint:', lastCsvCandle.close);
            } else {
                // No CSV data, generate some initial data
                this.chartData = await this.generateSampleDataForSymbol(this.currentSymbol);
            }
            
            
            this.loadData(); // Reload chart with current data
            this.startRealtimeUpdates();
            this.startRealTimeUIUpdates();
            this.showNotification('Live mode activated', 'success');
            
        } else {
            // Switching to CSV/Historical mode
            if (button) {
                button.textContent = '📊 Go Live';
                button.classList.remove('btn--primary');
                button.classList.add('btn--secondary');
            }
            if (dataMode) dataMode.textContent = '📊 Historical Data';
            
            this.stopRealtimeUpdates();
            this.stopRealTimeUIUpdates();
            
            // Revert to CSV data if available
            if (this.csvData && this.csvData.length > 0) {
                this.chartData = [...this.csvData]; // Restore original CSV data
                this.loadData(); // Reload chart with CSV data
                this.updateChartInfo();
                this.showNotification('Switched back to CSV data', 'info');
            } else {
               // this.showNotification('No CSV data available. Please upload a CSV file.', 'warning');
            }
        }
        this.updateSymbolDisplay();
        try {
          const data = await this.fetchLiveQuote(this.currentSymbol);
          this.livePriceCache[this.currentSymbol] = data;
          this.updateSymbolPrice();
        } catch {}

        this.updateStreamingButtons(false); // Hide stop button when not streaming

    }
    
    // Start realtime updates
    startRealtimeUpdates() {
        if (this.realtimeInterval) {
            clearInterval(this.realtimeInterval);
        }

        this.realtimeInterval = setInterval(() => {
            this.generateNewCandle();
        }, 2000);
    }

    // Stop realtime updates
    stopRealtimeUpdates() {
        if (this.realtimeInterval) {
            clearInterval(this.realtimeInterval);
            this.realtimeInterval = null;
        }
    }

    // Generate new candle for realtime simulation
    async generateNewCandle() {
        if (this.chartData.length === 0 || !this.candlestickSeries) return;
        
        const lastCandle = this.chartData[this.chartData.length - 1];
        
        // Try to get real current price periodically
        let realTimePrice = null;
        if (Math.random() < 0.1) { // 10% chance to fetch real price
            try {
                const priceData = await this.fetchRealTimePrice(this.currentSymbol);
                realTimePrice = priceData.price;
            } catch (error) {
                // Continue with simulated movement
            }
        }
        
        // Use current timestamp for live data
        const now = new Date();
        const currentTime = Math.floor(now.getTime() / 1000);
        
        let newPrice;
        if (realTimePrice) {
            // Use real price with small random variation
            newPrice = realTimePrice + (Math.random() - 0.5) * realTimePrice * 0.001;
        } else {
            // Normal price simulation
            const volatility = 0.002; // Reduced volatility for more realistic movement
            const change = (Math.random() - 0.5) * 2 * volatility * lastCandle.close;
            newPrice = lastCandle.close + change;
        }
        
        const spread = newPrice * 0.001;
        const high = newPrice + Math.random() * spread;
        const low = newPrice - Math.random() * spread;
        const open = lastCandle.close;
        const close = low + Math.random() * (high - low);
        const volume = Math.floor(Math.random() * 2000000) + 500000;
        
        const newCandle = {
            time: currentTime,
            open: parseFloat(open.toFixed(2)),
            high: parseFloat(high.toFixed(2)),
            low: parseFloat(low.toFixed(2)),
            close: parseFloat(close.toFixed(2)),
            volume: volume
        };
        
        this.chartData.push(newCandle);
        this.candlestickSeries.update(newCandle);
        
        if (this.volumeSeries) {
            this.volumeSeries.update({
                time: newCandle.time,
                value: newCandle.volume,
                color: newCandle.close >= newCandle.open 
                    ? (this.currentTheme === 'dark' ? '#26a69a80' : '#08998180')
                    : (this.currentTheme === 'dark' ? '#ef535080' : '#f2364580')
            });
        }
        
        // Keep only last 1000 candles
        if (this.chartData.length > 1000) {
            this.chartData = this.chartData.slice(-1000);
        }

        if (this.indicators.xyz && this.isRealtime) {
            const recent = this.chartData.slice(-20);
            const pts = this.calculateXYZIndicator(recent,14,2.5);
            if (pts.length) this.indicators.xyz.update(pts.pop());
          }
          
    }

//Aggregate candle update
aggregateData(timeframe) {
    const interval = this.timeframeMap[timeframe];
    if (!interval || !this.chartData.length) return this.chartData;

    const aggregated = [];
    let bucket = null;
    let bucketEnd = 0;

    this.chartData.forEach(candle => {
        const t = candle.time;

        if (!bucket || t >= bucketEnd) {
            bucketEnd = t + interval;
            bucket = {
                time: t,
                open: candle.open,
                high: candle.high,
                low: candle.low,
                close: candle.close,
                volume: candle.volume
            };
            aggregated.push(bucket);
        } else {
            bucket.high = Math.max(bucket.high, candle.high);
            bucket.low = Math.min(bucket.low, candle.low);
            bucket.close = candle.close;
            bucket.volume += candle.volume;
        }
    });

    return aggregated;
}



tradingViewTickFormatter(time, tickMarkType) {
    // `time` is UTCTimestamp (seconds)
    const unix = typeof time === 'number' ? time : time;
    const d = new Date(unix * 1000);

    const IST_TZ = "Asia/Kolkata";
    const T = LightweightCharts.TickMarkType;

    // FULL TradingView-style logic based on tick mark type
    switch (tickMarkType) {
        case T.Time:
        case T.TimeWithSeconds:
            // Intraday labels: HH:MM (IST)
            return d.toLocaleTimeString("en-IN", {
                timeZone: IST_TZ,
                hour: "2-digit",
                minute: "2-digit"
            });

        case T.DayOfMonth:
            // Day-of-month labels (bold major ticks)
            return d.toLocaleDateString("en-IN", {
                timeZone: IST_TZ,
                day: "2-digit"
            });

        case T.Month:
            // Monthly labels
            return d.toLocaleDateString("en-IN", {
                timeZone: IST_TZ,
                month: "short"
            });

        case T.Year:
            // Yearly labels
            return d.toLocaleDateString("en-IN", {
                timeZone: IST_TZ,
                year: "numeric"
            });

        default:
            // Fallback: day + month
            return d.toLocaleDateString("en-IN", {
                timeZone: IST_TZ,
                day: "2-digit",
                month: "short"
            });
    }
}


//change time frame
// Change time frame – TradingView-style timescale
async changeTimeframe(tf) {
    this.currentTimeframe = tf;

    const aggregated = this.aggregateData(tf);
    this.candlestickSeries.setData(aggregated);

    // Volume
    const volumeData = aggregated.map(c => ({
        time: c.time,
        value: c.volume,
        color: c.close >= c.open ? "#26a69aAA" : "#ef5350AA"
    }));
    this.volumeSeries.setData(volumeData);

    // Adjust bar spacing per timeframe (visual density)
    const ts = this.chart.timeScale();
    const spacingByTF = {
        "1m": 4,
        "5m": 5,
        "15m": 6,
        "30m": 7,
        "1h": 8,
        "4h": 10,
        "1D": 12,
        "1W": 14
    };
    ts.applyOptions({
        barSpacing: spacingByTF[tf] || 6
    });

    // Optional: ensure first day (01) is in range
    if (aggregated.length > 0) {
        const firstTime = aggregated[0].time;
        const lastTime  = aggregated[aggregated.length - 1].time;

        // Midnight of first day (in UTC seconds, chart treats as UTC)
        const dayStart = Math.floor(firstTime / 86400) * 86400;

        ts.setVisibleRange({
            from: dayStart,
            to: lastTime
        });
    }

    // Adjust candle body width if you still want it
    if (this.updateCandleWidth) {
        this.updateCandleWidth(tf);
    }
}



    

    // Change chart style
    changeChartStyle(style) {
        if (!this.chart) return;
        
        document.querySelectorAll('.chart-style-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const clickedBtn = document.querySelector(`[data-style="${style}"]`);
        if (clickedBtn) {
            clickedBtn.classList.add('active');
        }
        
        this.chartStyle = style;
        
        // Remove existing series
        this.chart.removeSeries(this.candlestickSeries);
        
        // Add new series based on style
        if (style === 'candlestick') {
            this.candlestickSeries = this.chart.addCandlestickSeries({
                upColor: this.currentTheme === 'dark' ? '#26a69a' : '#089981',
                downColor: this.currentTheme === 'dark' ? '#ef5350' : '#f23645',
                borderDownColor: this.currentTheme === 'dark' ? '#ef5350' : '#f23645',
                borderUpColor: this.currentTheme === 'dark' ? '#26a69a' : '#089981',
                wickDownColor: this.currentTheme === 'dark' ? '#ef5350' : '#f23645',
                wickUpColor: this.currentTheme === 'dark' ? '#26a69a' : '#089981',
            });
            this.candlestickSeries.setData(this.chartData);
        } else if (style === 'line') {
            this.candlestickSeries = this.chart.addLineSeries({
                color: this.currentTheme === 'dark' ? '#2196f3' : '#1976d2',
                lineWidth: 2,
            });
            const lineData = this.chartData.map(item => ({
                time: item.time,
                value: item.close
            }));
            this.candlestickSeries.setData(lineData);
        } else if (style === 'area') {
            this.candlestickSeries = this.chart.addAreaSeries({
                topColor: this.currentTheme === 'dark' ? '#2196f380' : '#1976d280',
                bottomColor: this.currentTheme === 'dark' ? '#2196f310' : '#1976d210',
                lineColor: this.currentTheme === 'dark' ? '#2196f3' : '#1976d2',
                lineWidth: 2,
            });
            const areaData = this.chartData.map(item => ({
                time: item.time,
                value: item.close
            }));
            this.candlestickSeries.setData(areaData);
        }
        
        //this.showNotification(`Chart style changed to ${style}`, 'success');
    }

    // Select drawing tool
    selectDrawingTool(tool) {
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const selectedBtn = document.querySelector(`[data-tool="${tool}"]`);
        if (selectedBtn) {
            selectedBtn.classList.add('active');
        }
        
        this.drawingMode = tool;
        
        if (tool === 'cursor') {
            this.drawingMode = null;
            this.showNotification('Cursor mode activated', 'info');
        } else {
            this.showNotification(`${tool.charAt(0).toUpperCase() + tool.slice(1)} tool selected`, 'info');
        }
    }

    // Clear all drawings
    clearDrawings() {
        this.showNotification('All drawings cleared', 'success');
    }

    // Update indicator
    updateIndicator(indicator, enabled) {
        if (enabled) {
            this.addIndicator(indicator);
        } else {
            this.removeIndicator(indicator);
        }
    }

    // Add indicator
    addIndicator(indicator) {
        if (this.indicators[indicator] || !this.chart) {
            return;
        }

        switch (indicator) {
            case 'sma20':
                this.addSMA(20, '#ffeb3b');
                break;
            case 'sma50':
                this.addSMA(50, '#2196f3');
                break;
            case 'bb':
                this.addBollingerBands();
                break;      
            case 'volume':
                // Volume is default
                break;
        }
        
        this.showNotification(`${indicator.toUpperCase()} indicator added`, 'success');
    }

    // Remove indicator
    removeIndicator(indicator) {
        // Existing single-series removal
        if (this.indicators[indicator]) {
            this.chart.removeSeries(this.indicators[indicator]);
            delete this.indicators[indicator];
            this.showNotification(`${indicator.toUpperCase()} removed`, 'info');
        }
    }
    
    addDynamicIndicator(name, color) {
        if (this.indicators[name] || !this.chart) return;
        const pts = this.chartData
          .filter(c=>c[name]!=null&&!isNaN(c[name]))
          .map(c=>({time:c.time,value:parseFloat(c[name])}));
        if (!pts.length) return this.showNotification(`${name.toUpperCase()} data missing`,'warning');
        const s = this.chart.addLineSeries({
          color:color, lineWidth:2, title:name.toUpperCase()
        });
        s.setData(pts);
        this.indicators[name]=s;
      }
      removeIndicator(name) {
        if (!this.indicators[name]) return;
        this.chart.removeSeries(this.indicators[name]);
        delete this.indicators[name];
        this.showNotification(`${name.toUpperCase()} removed`,'info');
      }

    // Add Simple Moving Average
    addSMA(period, color) {
        if (!this.chart || this.chartData.length < period) return;
        
        const smaData = this.calculateSMA(this.chartData, period);
        if (smaData.length === 0) return;
        
        const smaSeries = this.chart.addLineSeries({
            color: color,
            lineWidth: 2,
        });
        smaSeries.setData(smaData);
        this.indicators[`sma${period}`] = smaSeries;
    }

    // Calculate Simple Moving Average
    calculateSMA(data, period) {
        const smaData = [];
        for (let i = period - 1; i < data.length; i++) {
            let sum = 0;
            for (let j = 0; j < period; j++) {
                sum += data[i - j].close;
            }
            smaData.push({
                time: data[i].time,
                value: parseFloat((sum / period).toFixed(2))
            });
        }
        return smaData;
    }

    // Reapply all active indicators
    reapplyIndicators() {
        const activeIndicators = [];
        document.querySelectorAll('input[data-indicator]:checked').forEach(checkbox => {
            activeIndicators.push(checkbox.dataset.indicator);
        });
        
        activeIndicators.forEach(indicator => {
            this.addIndicator(indicator);
        });
    }

    // Update all indicators with new data
    updateAllIndicators() {
        Object.keys(this.indicators).forEach(key => {
            if (key.startsWith('sma')) {
                const period = parseInt(key.replace('sma', ''));
                const color = period === 20 ? '#ffeb3b' : '#2196f3';
                this.removeIndicator(key);
                this.addSMA(period, color);
            } else if (key === 'bb') {
                this.removeIndicator(key);
            }
        });
    }

    // Change symbol
    // Change symbol
async changeSymbol(symbol) {
    console.log('Changing symbol from', this.currentSymbol, 'to', symbol);
    
    const previousSymbol = this.currentSymbol;
    this.currentSymbol = symbol;
    
    // Update dropdown to reflect current selection
    const symbolSelect = document.getElementById('symbolSelect');
    if (symbolSelect) {
        symbolSelect.value = symbol;
    }
    
    // Update symbol display immediately
    this.updateSymbolDisplay();
    
    // Stop current updates to prevent conflicts
    this.stopRealtimeUpdates();
    this.stopRealTimeUIUpdates();
    
    try {
        if (this.isRealtime) {
            // If in live mode, generate new live data for the symbol
            this.showNotification(`Loading live data for ${symbol}...`, 'info');
            
            this.chartData = await this.generateSampleDataForSymbol(symbol);
            this.loadData();
            this.updateChartInfo();
            
            // Restart live updates
            this.startRealtimeUpdates();
            this.startRealTimeUIUpdates();
            
            // Fetch and cache live price
            const data = await this.fetchLiveQuote(symbol);
            this.livePriceCache[symbol] = data;
            this.updateSymbolPrice();
            
            this.showNotification(`Loaded ${symbol} with live data`, 'success');
        } else {
            // If in CSV mode, just update the symbol display but keep CSV data
            if (this.csvData && this.csvData.length > 0) {
                // Keep using CSV data, just update symbol name
                this.updateChartInfo();
                this.showNotification(`Symbol changed to ${symbol} (using CSV data)`, 'info');
            } else {
                this.showNotification(`Please upload CSV data for ${symbol} or go live`, 'info');
            }
            
            // Still try to fetch live price for display
            try {
                const data = await this.fetchLiveQuote(symbol);
                this.livePriceCache[symbol] = data;
                this.updateSymbolPrice();
            } catch (error) {
                console.log('Could not fetch live price for display:', error);
            }
        }
    } catch (error) {
        console.error('Error changing symbol:', error);
        this.currentSymbol = previousSymbol; // Revert on error
        if (symbolSelect) symbolSelect.value = previousSymbol;
        this.updateSymbolDisplay();
        this.showNotification(`Error loading ${symbol} data`, 'error');
    }
}

    // Toggle bottom panel
    toggleBottomPanel() {
        const panel = document.querySelector('.bottom-panel');
        const button = document.getElementById('toggleBottomPanel');
        
        if (panel && button) {
            panel.classList.toggle('collapsed');
            button.textContent = panel.classList.contains('collapsed') ? '+' : '−';
        }
    }

    // Export chart
    exportChart() {
        this.showNotification('Chart export functionality would be implemented here', 'info');
    }

    // Show notification
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification--${type}`;
        notification.textContent = message;
        
        Object.assign(notification.style, {
            position: 'fixed',
            top: '70px',
            right: '20px',
            padding: '12px 16px',
            backgroundColor: type === 'success' ? '#26a69a' : type === 'error' ? '#ef5350' : '#2196f3',
            color: 'white',
            borderRadius: '6px',
            zIndex: '10000',
            fontSize: '14px',
            fontWeight: '500',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
            transform: 'translateX(100%)',
            transition: 'transform 0.3s ease',
            maxWidth: '300px'
        });
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 10);
        
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing TradingView App...');
    new TradingViewApp();
});
