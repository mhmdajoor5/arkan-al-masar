'use client';

import {Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList} from '@/components/ui/combobox';
import {useLocale} from '@/lib/arkan-client';
import nationalities from '@/lib/nationalities.json';

type Nationality = typeof nationalities[number];
const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f\u064b-\u065f\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').trim();
const matches = (item: Nationality, query: string) => normalize(`${item.ar} ${item.en} ${item.countryAr} ${item.countryEn} ${item.value}`).includes(normalize(query));

export default function NationalityPicker({value, onChange, index}: {value: string; onChange: (value: string) => void; index: number}) {
  const {en, t} = useLocale();
  const inputId = `passenger-nationality-${index}`;
  return <div className="nationality-field">
    <label htmlFor={inputId}>{t('الجنسية', 'Nationality')}</label>
    <Combobox items={nationalities} value={nationalities.find(item => item.value === value) ?? null}
      onValueChange={item => onChange(item?.value ?? '')} required name={inputId} autoHighlight
      itemToStringLabel={item => en ? item.en : item.ar} itemToStringValue={item => item.value}
      isItemEqualToValue={(item, selected) => item.value === selected.value} filter={matches}>
      <ComboboxInput id={inputId} className="nationality-input" placeholder={t('اختر الجنسية أو ابحث', 'Select or search nationality')}
        aria-label={t(`جنسية المسافر ${index + 1}`, `Passenger ${index + 1} nationality`)} autoComplete="off"/>
      <ComboboxContent dir={en ? 'ltr' : 'rtl'} className="nationality-options">
        <ComboboxEmpty>{t('لا توجد نتائج مطابقة', 'No matching nationalities')}</ComboboxEmpty>
        <ComboboxList>{(item: Nationality) => <ComboboxItem key={item.value} value={item}>
          {en ? item.en : item.ar}
        </ComboboxItem>}</ComboboxList>
      </ComboboxContent>
    </Combobox>
  </div>;
}
