import { useMemo } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { feature } from 'topojson-client';
import countriesData from 'world-atlas/countries-110m.json';
import countries from 'i18n-iso-countries';
import enLocale from 'i18n-iso-countries/langs/en.json';

countries.registerLocale(enLocale);

const DEFAULT_PROJECTION_CONFIG = {
  scale: 140,
  center: [0, 20],
};

type WorldMapProps = {
  selectedCountry: string;
  onCountrySelect: (country: string) => void;
};

const countryColors = {
  default: '#1f2937',
  hover: '#2563eb',
  selected: '#0891b2',
};

export function WorldMap({ selectedCountry, onCountrySelect }: WorldMapProps) {
  const geography = useMemo(() => {
    const geoJson = feature(countriesData as any, (countriesData as any).objects.countries) as any;
    return {
      type: 'FeatureCollection',
      features: geoJson.features
        .map((geo: any) => {
          const countryName = geo.properties?.name;
          const countryCode = countryName ? countries.getAlpha2Code(countryName, 'en') || '' : '';
          return {
            ...geo,
            properties: {
              ...geo.properties,
              name: countryName,
              ISO_A2: countryCode,
            },
          };
        })
        .filter((geo: any) => geo.properties.ISO_A2),
    };
  }, []);

  return (
    <ComposableMap projectionConfig={DEFAULT_PROJECTION_CONFIG} projection="geoMercator" style={{ width: '100%', height: '100%' }}>
      <Geographies geography={geography}>
        {({ geographies }) =>
          geographies.map((geo) => {
            const countryCode = geo.properties.ISO_A2 || '';
            const isSelected = countryCode === selectedCountry;
            return (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill={isSelected ? countryColors.selected : countryColors.default}
                stroke="#111827"
                strokeWidth={0.4}
                onClick={() => {
                  if (countryCode) {
                    onCountrySelect(countryCode);
                  }
                }}
                style={{
                  default: {
                    outline: 'none',
                    transition: 'fill 150ms ease',
                  },
                  hover: {
                    fill: countryColors.hover,
                    outline: 'none',
                    cursor: 'pointer',
                  },
                  pressed: {
                    fill: '#0ea5e9',
                    outline: 'none',
                  },
                }}
              />
            );
          })
        }
      </Geographies>
    </ComposableMap>
  );
}
