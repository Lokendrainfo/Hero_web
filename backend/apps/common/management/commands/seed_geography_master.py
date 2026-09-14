from django.core.management.base import BaseCommand
from apps.common.models import Circle, District, Block

class Command(BaseCommand):
    help = 'Seed initial Circle, District, and Block geography master data'

    def handle(self, *args, **options):
        data = {
            "Haryana": {
                "Gurugram": ["Gurugram", "Sohna", "Pataudi", "Farrukhnagar"],
                "Faridabad": ["Faridabad", "Ballabgarh"],
                "Karnal": ["Karnal", "Gharaunda", "Assandh", "Indri", "Nilokheri"],
                "Ambala": ["Ambala", "Barara", "Naraingarh", "Saha"]
            },
            "Rajasthan": {
                "Jaipur": ["Jaipur", "Amber", "Sanganer", "Chaksu", "Kotputli"],
                "Jodhpur": ["Jodhpur", "Luni", "Shergarh", "Osian", "Phalodi"],
                "Udaipur": ["Udaipur", "Girwa", "Salumbar", "Mavli", "Jhadol"],
                "Kota": ["Kota", "Ladpura", "Sangod", "Ramganj Mandi"]
            },
            "Punjab": {
                "Ludhiana": ["Ludhiana", "Jagraon", "Khanna", "Samrala", "Payal"],
                "Amritsar": ["Amritsar", "Ajnala", "Baba Bakala"],
                "Jalandhar": ["Jalandhar", "Nakodar", "Phillaur", "Shahkot"],
                "Patiala": ["Patiala", "Nabha", "Rajpura", "Samana"]
            },
            "Delhi": {
                "South Delhi": ["Hauz Khas", "Saket", "Mehrauli"],
                "New Delhi": ["Chanakyapuri", "Vasant Vihar", "Connaught Place"],
                "North Delhi": ["Sadar Bazar", "Kotwali", "Civil Lines"],
                "West Delhi": ["Patel Nagar", "Rajouri Garden", "Punjabi Bagh"]
            }
        }

        circles_created = 0
        districts_created = 0
        blocks_created = 0

        for circle_name, districts in data.items():
            circle, c_created = Circle.objects.get_or_create(
                name=circle_name,
                defaults={'code': circle_name.upper()[:4]}
            )
            if c_created:
                circles_created += 1

            for district_name, blocks in districts.items():
                district, d_created = District.objects.get_or_create(
                    circle=circle,
                    name=district_name,
                    defaults={'code': district_name.upper()[:4]}
                )
                if d_created:
                    districts_created += 1

                for block_name in blocks:
                    block, b_created = Block.objects.get_or_create(
                        district=district,
                        name=block_name,
                        defaults={'code': block_name.upper()[:4]}
                    )
                    if b_created:
                        blocks_created += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully seeded geography master! "
                f"Circles created: {circles_created}, "
                f"Districts created: {districts_created}, "
                f"Blocks created: {blocks_created}."
            )
        )
